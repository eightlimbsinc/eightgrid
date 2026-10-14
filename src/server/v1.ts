import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CellGetter } from "@/lib/compute";
import { isEmptyValue, type Attachment } from "@/lib/fields";
import { evaluateFormula } from "@/lib/formula";
import { applySorts, viewRecords } from "@/lib/query";
import { hasRole, type Field, type RecordRow, type Role, type SortSpec, type Table } from "@/lib/types";
import { requireApiUser, type SessionUser } from "./access";
import { badRequest, forbidden, notFound } from "./http";
import { tableFields } from "./records";
import { toTable, toView } from "./serialize";

export interface V1Context {
  user: SessionUser;
  role: Role;
  table: Table;
  fields: Field[];
  members: Map<string, { id: string; email: string; name: string }>;
}

/** Resolve the caller, their role and the table (by id or name) for a v1 request. */
export async function v1Context(req: Request, baseId: string, tableRef: string, min: Role): Promise<V1Context> {
  const user = await requireApiUser(req);
  const [membership] = await db
    .select()
    .from(schema.baseMembers)
    .where(and(eq(schema.baseMembers.baseId, baseId), eq(schema.baseMembers.userId, user.id)));
  if (!membership) throw notFound("Base not found");
  const role = membership.role as Role;
  if (!hasRole(role, min)) throw forbidden();
  const tables = await db.select().from(schema.tables).where(eq(schema.tables.baseId, baseId));
  const ref = decodeURIComponent(tableRef);
  const t = tables.find((x) => x.id === ref) ?? tables.find((x) => x.name.toLowerCase() === ref.toLowerCase());
  if (!t) throw notFound(`Table "${ref}" not found`);
  const fields = await tableFields(db, t.id);
  const memberRows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.baseMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.baseMembers.userId))
    .where(eq(schema.baseMembers.baseId, baseId));
  return { user, role, table: toTable(t), fields, members: new Map(memberRows.map((m) => [m.id, m])) };
}

function fieldByName(ctx: V1Context, name: string): Field {
  const f = ctx.fields.find((x) => x.name === name) ?? ctx.fields.find((x) => x.id === name) ?? ctx.fields.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!f) throw badRequest(`Unknown field name: "${name}"`);
  return f;
}

/** Convert API input `{ "Field name": value }` into internal `{ fldId: value }`. */
export function inputFields(ctx: V1Context, input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(input ?? {})) {
    const f = fieldByName(ctx, name);
    let v = value;
    if (f.type === "user") {
      if (v && typeof v === "object" && "id" in (v as object)) v = (v as { id: string }).id;
      if (typeof v === "string" && v.includes("@")) {
        v = [...ctx.members.values()].find((m) => m.email.toLowerCase() === (v as string).toLowerCase())?.id ?? null;
      }
    }
    if (f.type === "attachment" && Array.isArray(v)) {
      v = v.map((a) => (a && typeof a === "object" && "filename" in a && !("name" in a) ? { ...a, name: (a as { filename: string }).filename } : a));
    }
    out[f.id] = v;
  }
  return out;
}

/** Reload field metadata (e.g. after typecast added select options). */
export async function refreshFields(ctx: V1Context) {
  ctx.fields = await tableFields(db, ctx.table.id);
}

export function makeGetter(ctx: V1Context) {
  return new CellGetter({
    fields: ctx.fields,
    userName: (id) => ctx.members.get(id)?.name,
  });
}

/** Convert a stored record into the API shape, keyed by field names. */
export function outputRecord(ctx: V1Context, getter: CellGetter, r: RecordRow, only?: Set<string>) {
  const fields: Record<string, unknown> = {};
  for (const f of ctx.fields) {
    if (only && !only.has(f.name) && !only.has(f.id)) continue;
    let v = getter.get(r, f);
    if (v instanceof Error) v = { error: "#ERROR" };
    if (isEmptyValue(v)) continue;
    switch (f.type) {
      case "singleSelect":
        v = f.options.choices?.find((c) => c.id === v)?.name;
        break;
      case "multiSelect":
        v = (v as string[]).map((id) => f.options.choices?.find((c) => c.id === id)?.name).filter(Boolean);
        break;
      case "user":
      case "createdBy":
      case "lastModifiedBy": {
        const m = ctx.members.get(v as string);
        v = m ? { id: m.id, email: m.email, name: m.name } : { id: v };
        break;
      }
      case "attachment":
        v = (v as Attachment[]).map((a) => ({ url: a.url, filename: a.name }));
        break;
    }
    if (v !== undefined) fields[f.name] = v;
  }
  return { id: r.id, createdTime: r.createdAt, fields };
}

export interface ListParams {
  pageSize: number;
  offset: number;
  view?: string;
  fields?: Set<string>;
  sort: SortSpec[];
  filterByFormula?: string;
  maxRecords?: number;
}

export function parseListParams(ctx: V1Context, url: URL): ListParams {
  const p = url.searchParams;
  const pageSize = Math.min(100, Math.max(1, Number(p.get("pageSize") ?? 100) || 100));
  const offset = Math.max(0, Number(p.get("offset") ?? 0) || 0);
  const fieldNames = [...p.getAll("fields[]"), ...p.getAll("fields")];
  const sort: SortSpec[] = [];
  for (let i = 0; i < 10; i++) {
    const name = p.get(`sort[${i}][field]`);
    if (!name) break;
    const dir = p.get(`sort[${i}][direction]`) === "desc" ? "desc" : "asc";
    sort.push({ fieldId: fieldByName(ctx, name).id, direction: dir });
  }
  const maxRecords = p.get("maxRecords") ? Math.max(1, Number(p.get("maxRecords")) || 1) : undefined;
  return {
    pageSize,
    offset,
    view: p.get("view") ?? undefined,
    fields: fieldNames.length ? new Set(fieldNames) : undefined,
    sort,
    filterByFormula: p.get("filterByFormula") ?? undefined,
    maxRecords,
  };
}

export async function listV1(ctx: V1Context, records: RecordRow[], params: ListParams) {
  const getter = makeGetter(ctx);
  let rows = records;
  if (params.view) {
    const views = await db.select().from(schema.views).where(eq(schema.views.tableId, ctx.table.id));
    const v = views.find((x) => x.id === params.view) ?? views.find((x) => x.name === params.view);
    if (!v) throw badRequest(`View "${params.view}" not found`);
    rows = viewRecords(rows, toView(v), getter);
  } else {
    rows = [...rows].sort((a, b) => a.position - b.position);
  }
  if (params.filterByFormula) {
    const formula = params.filterByFormula;
    rows = rows.filter((r) => {
      try {
        const v = evaluateFormula(formula, {
          ref: (name) => {
            const f = ctx.fields.find((x) => x.name === name || x.id === name);
            if (!f) throw new Error(`Unknown field {${name}}`);
            const val = getter.get(r, f);
            if (f.type === "number" || f.type === "currency" || f.type === "percent" || f.type === "rating") return (val as number) ?? null;
            if (f.type === "checkbox") return !!val;
            return getter.text(r, f) || null;
          },
          recordId: r.id,
          createdTime: r.createdAt,
          lastModifiedTime: r.updatedAt,
        });
        return !!v && v !== "0" && !(Array.isArray(v) && !v.length);
      } catch (e) {
        throw badRequest(`filterByFormula: ${(e as Error).message}`);
      }
    });
  }
  if (params.sort.length) rows = applySorts(rows, params.sort, getter);
  if (params.maxRecords) rows = rows.slice(0, params.maxRecords);
  const page = rows.slice(params.offset, params.offset + params.pageSize);
  const next = params.offset + params.pageSize < rows.length ? String(params.offset + params.pageSize) : undefined;
  return {
    records: page.map((r) => outputRecord(ctx, getter, r, params.fields)),
    ...(next ? { offset: next } : {}),
  };
}
