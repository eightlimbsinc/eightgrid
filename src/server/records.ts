import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Executor } from "@/db";
import { coerceValue, ensureChoices, isComputed } from "@/lib/fields";
import { newId } from "@/lib/ids";
import type { Field, RecordRow, Table } from "@/lib/types";
import { logActivity, type Actor } from "./activity";
import { badRequest } from "./http";
import { toField, toRecord } from "./serialize";

export const MAX_BATCH = 1000;

export async function tableFields(ex: Executor, tableId: string): Promise<Field[]> {
  const rows = await ex
    .select()
    .from(schema.fields)
    .where(eq(schema.fields.tableId, tableId))
    .orderBy(asc(schema.fields.position));
  return rows.map(toField);
}

export async function listRecords(ex: Executor, tableId: string): Promise<RecordRow[]> {
  const rows = await ex
    .select()
    .from(schema.records)
    .where(eq(schema.records.tableId, tableId))
    .orderBy(asc(schema.records.position));
  return rows.map(toRecord);
}

type FieldInput = Record<string, unknown>;

/**
 * With typecast, unknown select options are created on the fly (used by paste, CSV import and the API).
 * Mutates `fields` in place with the new choices.
 */
async function typecastChoices(ex: Executor, fields: Field[], inputs: FieldInput[]) {
  for (const f of fields) {
    if (f.type !== "singleSelect" && f.type !== "multiSelect") continue;
    const raw = inputs.map((i) => i[f.id]).filter((v) => v !== undefined && v !== null);
    if (!raw.length) continue;
    const choices = ensureChoices(f, raw);
    if (!choices) continue;
    f.options = { ...f.options, choices };
    await ex.update(schema.fields).set({ options: f.options }).where(eq(schema.fields.id, f.id));
  }
}

function sanitize(fields: Map<string, Field>, input: FieldInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(input)) {
    const f = fields.get(fieldId);
    if (!f) throw badRequest(`Unknown field ${fieldId}`);
    if (isComputed(f.type)) continue;
    out[fieldId] = coerceValue(f, value);
  }
  return out;
}

/** Drop link ids that don't exist in the linked table. */
async function validateLinks(ex: Executor, fields: Map<string, Field>, datas: Record<string, unknown>[]) {
  for (const f of fields.values()) {
    if (f.type !== "link" || !f.options.linkedTableId) continue;
    const all = new Set<string>();
    for (const d of datas) for (const id of (d[f.id] as string[] | null | undefined) ?? []) all.add(id);
    if (!all.size) continue;
    const found = await ex
      .select({ id: schema.records.id })
      .from(schema.records)
      .where(and(eq(schema.records.tableId, f.options.linkedTableId), inArray(schema.records.id, [...all])));
    const ok = new Set(found.map((r) => r.id));
    for (const d of datas) {
      const ids = d[f.id] as string[] | null | undefined;
      if (!ids) continue;
      const kept = ids.filter((id) => ok.has(id));
      d[f.id] = kept.length ? kept : null;
    }
  }
}

function compact(data: Record<string, unknown>) {
  for (const k of Object.keys(data)) if (data[k] === null || data[k] === undefined) delete data[k];
  return data;
}

/**
 * Keep two-way links consistent: when `recordId` gains/loses links through `field`,
 * add/remove the reverse link on the other side.
 */
async function syncBacklinks(
  ex: Executor,
  field: Field,
  recordId: string,
  added: string[],
  removed: string[],
  actor: Actor,
): Promise<string | null> {
  const inverse = field.options.inverseFieldId;
  const linkedTableId = field.options.linkedTableId;
  if (!inverse || !linkedTableId || (!added.length && !removed.length)) return null;
  const rows = await ex
    .select()
    .from(schema.records)
    .where(and(eq(schema.records.tableId, linkedTableId), inArray(schema.records.id, [...added, ...removed])));
  for (const row of rows) {
    const list = new Set<string>((row.data[inverse] as string[] | undefined) ?? []);
    if (added.includes(row.id)) list.add(recordId);
    if (removed.includes(row.id)) list.delete(recordId);
    const data = { ...row.data };
    if (list.size) data[inverse] = [...list];
    else delete data[inverse];
    await ex
      .update(schema.records)
      .set({ data, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(schema.records.id, row.id));
  }
  return linkedTableId;
}

export interface CreateItem {
  fields: FieldInput;
  position?: number;
}

export async function createRecords(
  ex: Executor,
  table: Table,
  items: CreateItem[],
  actor: Actor,
  opts: { typecast?: boolean } = {},
): Promise<RecordRow[]> {
  if (items.length > MAX_BATCH) throw badRequest(`At most ${MAX_BATCH} records per request`);
  if (!items.length) return [];
  const fields = await tableFields(ex, table.id);
  if (opts.typecast) await typecastChoices(ex, fields, items.map((i) => i.fields));
  const byId = new Map(fields.map((f) => [f.id, f]));
  const datas = items.map((i) => sanitize(byId, i.fields ?? {}));
  await validateLinks(ex, byId, datas);

  const [{ max }] = await ex
    .select({ max: sql<number | null>`max(${schema.records.position})` })
    .from(schema.records)
    .where(eq(schema.records.tableId, table.id));
  let next = (max ?? 0) + 1;

  const now = new Date();
  const values = items.map((item, i) => ({
    id: newId("rec"),
    tableId: table.id,
    data: compact(datas[i]),
    position: item.position ?? next++,
    createdBy: actor.userId,
    updatedBy: actor.userId,
    createdAt: now,
    updatedAt: now,
  }));
  const inserted: (typeof schema.records.$inferSelect)[] = [];
  for (let i = 0; i < values.length; i += 200) {
    inserted.push(...(await ex.insert(schema.records).values(values.slice(i, i + 200)).returning()));
  }

  const touchedTables = new Set<string>();
  for (const f of fields) {
    if (f.type !== "link") continue;
    for (const r of inserted) {
      const ids = (r.data[f.id] as string[] | undefined) ?? [];
      const t = await syncBacklinks(ex, f, r.id, ids, [], actor);
      if (t) touchedTables.add(t);
    }
  }

  await logActivity(
    ex,
    actor,
    inserted.map((r) => ({ baseId: table.baseId, tableId: table.id, recordId: r.id, kind: "record.create", payload: {} })),
  );
  for (const t of touchedTables) {
    await logActivity(ex, actor, { baseId: table.baseId, tableId: t, kind: "record.links" });
  }
  return inserted.map(toRecord);
}

export interface UpdateItem {
  id: string;
  fields: FieldInput;
}

export async function updateRecords(
  ex: Executor,
  table: Table,
  items: UpdateItem[],
  actor: Actor,
  opts: { typecast?: boolean; replace?: boolean } = {},
): Promise<RecordRow[]> {
  if (items.length > MAX_BATCH) throw badRequest(`At most ${MAX_BATCH} records per request`);
  if (!items.length) return [];
  const fields = await tableFields(ex, table.id);
  if (opts.typecast) await typecastChoices(ex, fields, items.map((i) => i.fields));
  const byId = new Map(fields.map((f) => [f.id, f]));
  const existing = await ex
    .select()
    .from(schema.records)
    .where(and(eq(schema.records.tableId, table.id), inArray(schema.records.id, items.map((i) => i.id))));
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const patches = items.map((i) => sanitize(byId, i.fields ?? {}));
  await validateLinks(ex, byId, patches);

  const out: RecordRow[] = [];
  const touchedTables = new Set<string>();
  const log: Parameters<typeof logActivity>[2] = [];
  const now = new Date();
  for (let i = 0; i < items.length; i++) {
    const old = existingById.get(items[i].id);
    if (!old) throw badRequest(`Record ${items[i].id} not found in table`);
    const patch = patches[i];
    // `replace` (API PUT) clears every field not supplied
    const base: Record<string, unknown> = opts.replace ? {} : { ...old.data };
    const data = compact({ ...base, ...patch });
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of new Set([...Object.keys(old.data), ...Object.keys(data)])) {
      if (JSON.stringify(old.data[key] ?? null) !== JSON.stringify(data[key] ?? null)) {
        changes[key] = { from: old.data[key] ?? null, to: data[key] ?? null };
      }
    }
    if (!Object.keys(changes).length) {
      out.push(toRecord(old));
      continue;
    }
    const [updated] = await ex
      .update(schema.records)
      .set({ data, updatedAt: now, updatedBy: actor.userId })
      .where(eq(schema.records.id, old.id))
      .returning();
    out.push(toRecord(updated));
    for (const fieldId of Object.keys(changes)) {
      const f = byId.get(fieldId);
      if (f?.type !== "link") continue;
      const before = (changes[fieldId].from as string[] | null) ?? [];
      const after = (changes[fieldId].to as string[] | null) ?? [];
      const t = await syncBacklinks(
        ex,
        f,
        old.id,
        after.filter((x) => !before.includes(x)),
        before.filter((x) => !after.includes(x)),
        actor,
      );
      if (t) touchedTables.add(t);
    }
    log.push({ baseId: table.baseId, tableId: table.id, recordId: old.id, kind: "record.update", payload: { changes } });
  }
  await logActivity(ex, actor, log);
  for (const t of touchedTables) await logActivity(ex, actor, { baseId: table.baseId, tableId: t, kind: "record.links" });
  return out;
}

export async function moveRecord(ex: Executor, table: Table, id: string, position: number, actor: Actor) {
  await ex
    .update(schema.records)
    .set({ position })
    .where(and(eq(schema.records.tableId, table.id), eq(schema.records.id, id)));
  await logActivity(ex, actor, { baseId: table.baseId, tableId: table.id, recordId: id, kind: "record.move" });
}

export async function deleteRecords(ex: Executor, table: Table, ids: string[], actor: Actor): Promise<string[]> {
  if (ids.length > MAX_BATCH) throw badRequest(`At most ${MAX_BATCH} records per request`);
  if (!ids.length) return [];
  const fields = await tableFields(ex, table.id);
  const rows = await ex
    .delete(schema.records)
    .where(and(eq(schema.records.tableId, table.id), inArray(schema.records.id, ids)))
    .returning();
  const touchedTables = new Set<string>();
  for (const f of fields) {
    if (f.type !== "link") continue;
    for (const r of rows) {
      const t = await syncBacklinks(ex, f, r.id, [], (r.data[f.id] as string[] | undefined) ?? [], actor);
      if (t) touchedTables.add(t);
    }
  }
  // Self-links within the same table have no inverse field; strip dangling references.
  for (const f of fields) {
    if (f.type === "link" && f.options.linkedTableId === table.id && !f.options.inverseFieldId) {
      await stripLinkIds(ex, table.id, f.id, rows.map((r) => r.id));
    }
  }
  await logActivity(
    ex,
    actor,
    rows.map((r) => ({
      baseId: table.baseId,
      tableId: table.id,
      recordId: r.id,
      kind: "record.delete",
      payload: { data: r.data },
    })),
  );
  for (const t of touchedTables) await logActivity(ex, actor, { baseId: table.baseId, tableId: t, kind: "record.links" });
  return rows.map((r) => r.id);
}

async function stripLinkIds(ex: Executor, tableId: string, fieldId: string, ids: string[]) {
  const rows = await ex.select().from(schema.records).where(eq(schema.records.tableId, tableId));
  for (const r of rows) {
    const list = r.data[fieldId] as string[] | undefined;
    if (!list?.some((id) => ids.includes(id))) continue;
    const kept = list.filter((id) => !ids.includes(id));
    const data = { ...r.data };
    if (kept.length) data[fieldId] = kept;
    else delete data[fieldId];
    await ex.update(schema.records).set({ data }).where(eq(schema.records.id, r.id));
  }
}

/** Remove a field's values from every record of a table. */
export async function stripField(ex: Executor, tableId: string, fieldId: string) {
  await ex
    .update(schema.records)
    .set({ data: sql`${schema.records.data} - ${fieldId}::text` })
    .where(eq(schema.records.tableId, tableId));
}
