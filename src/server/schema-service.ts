import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type Executor } from "@/db";
import { COLORS, convertValue, defaultOptions, ensureChoices, FIELD_TYPE_SET, isComputed, cellToText } from "@/lib/fields";
import { validateFormula } from "@/lib/formula";
import { newId } from "@/lib/ids";
import type { BasePayload, Field, FieldOptions, FieldType, Invite, Member, Role, Table, View, ViewConfig, ViewType } from "@/lib/types";
import { logSchema, type Actor } from "./activity";
import { badRequest, notFound } from "./http";
import { createRecords, listRecords, stripField, tableFields } from "./records";
import { toField, toTable, toView } from "./serialize";

// ------------------------------------------------------------------ validation

const choiceSchema = z.object({ id: z.string().optional(), name: z.string(), color: z.string().optional() });

export const fieldOptionsSchema = z
  .object({
    precision: z.number().int().min(0).max(8).optional(),
    symbol: z.string().max(5).optional(),
    choices: z.array(choiceSchema).optional(),
    includeTime: z.boolean().optional(),
    max: z.number().int().min(1).max(10).optional(),
    linkedTableId: z.string().optional(),
    formula: z.string().max(10_000).optional(),
  })
  .partial();

export const fieldTypeSchema = z.string().refine((t) => FIELD_TYPE_SET.has(t), "Unknown field type") as unknown as z.ZodType<FieldType>;

export const fieldInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: fieldTypeSchema,
  options: fieldOptionsSchema.optional(),
  description: z.string().max(5000).optional(),
});

export type FieldInput = z.infer<typeof fieldInputSchema>;

const NO_PRIMARY: FieldType[] = ["link", "attachment", "checkbox", "multiSelect", "user"];

// ------------------------------------------------------------------ helpers

function uniqueName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

function normalizeOptions(type: FieldType, input: z.infer<typeof fieldOptionsSchema> | undefined, prev?: FieldOptions): FieldOptions {
  const o = { ...defaultOptions(type), ...(input ?? {}) } as FieldOptions & { choices?: z.infer<typeof choiceSchema>[] };
  const out: FieldOptions = {};
  switch (type) {
    case "number":
    case "percent":
      out.precision = o.precision ?? 0;
      break;
    case "currency":
      out.precision = o.precision ?? 2;
      out.symbol = o.symbol || "$";
      break;
    case "singleSelect":
    case "multiSelect": {
      const seen = new Set<string>();
      out.choices = (o.choices ?? [])
        .filter((c) => c.name.trim() && !seen.has(c.name.trim().toLowerCase()) && seen.add(c.name.trim().toLowerCase()))
        .map((c, i) => ({
          id: c.id && c.id.startsWith("sel") ? c.id : newId("sel"),
          name: c.name.trim(),
          color: c.color && (COLORS as readonly string[]).includes(c.color) ? c.color : COLORS[i % COLORS.length],
        }));
      break;
    }
    case "date":
      out.includeTime = !!o.includeTime;
      break;
    case "rating":
      out.max = o.max ?? 5;
      break;
    case "link":
      out.linkedTableId = o.linkedTableId ?? prev?.linkedTableId;
      out.inverseFieldId = prev?.inverseFieldId;
      break;
    case "formula": {
      out.formula = o.formula ?? "";
      if (o.precision !== undefined) out.precision = o.precision;
      const err = validateFormula(out.formula);
      if (err) throw badRequest(`Formula error: ${err}`);
      break;
    }
  }
  return out;
}

async function nextPosition(ex: Executor, t: typeof schema.fields | typeof schema.views, tableId: string) {
  const [{ m }] = await ex
    .select({ m: max(t.position) })
    .from(t)
    .where(eq(t.tableId, tableId));
  return (m ?? -1) + 1;
}

async function getTable(ex: Executor, tableId: string): Promise<Table> {
  const [t] = await ex.select().from(schema.tables).where(eq(schema.tables.id, tableId));
  if (!t) throw notFound("Table not found");
  return toTable(t);
}

// ------------------------------------------------------------------ bases

export async function loadBasePayload(baseId: string, role: Role): Promise<BasePayload> {
  const [base] = await db.select().from(schema.bases).where(eq(schema.bases.id, baseId));
  if (!base) throw notFound("Base not found");
  const tables = (
    await db.select().from(schema.tables).where(eq(schema.tables.baseId, baseId)).orderBy(asc(schema.tables.position))
  ).map(toTable);
  const tableIds = tables.map((t) => t.id);
  const [fields, views, members, invites, seq] = await Promise.all([
    tableIds.length
      ? db.select().from(schema.fields).where(inArray(schema.fields.tableId, tableIds)).orderBy(asc(schema.fields.position))
      : [],
    tableIds.length
      ? db.select().from(schema.views).where(inArray(schema.views.tableId, tableIds)).orderBy(asc(schema.views.position))
      : [],
    db
      .select({
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        image: schema.users.image,
        role: schema.baseMembers.role,
      })
      .from(schema.baseMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.baseMembers.userId))
      .where(eq(schema.baseMembers.baseId, baseId)),
    db
      .select({ email: schema.baseInvites.email, role: schema.baseInvites.role })
      .from(schema.baseInvites)
      .where(eq(schema.baseInvites.baseId, baseId)),
    db
      .select({ seq: max(schema.activity.seq) })
      .from(schema.activity)
      .where(eq(schema.activity.baseId, baseId)),
  ]);
  return {
    id: base.id,
    name: base.name,
    color: base.color,
    role,
    tables,
    fields: fields.map(toField),
    views: views.map(toView),
    members: members as Member[],
    invites: invites as Invite[],
    latestSeq: Number(seq[0]?.seq ?? 0),
  };
}

export async function createBase(userId: string, name: string, color: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const id = newId("bas");
    await tx.insert(schema.bases).values({ id, name, color, createdBy: userId });
    await tx.insert(schema.baseMembers).values({ baseId: id, userId, role: "owner" });
    const table = await createTable(tx, id, "Table 1", actor, { withSampleFields: true });
    return { id, tableId: table.id };
  });
}

// ------------------------------------------------------------------ tables

export interface CreateTableOpts {
  withSampleFields?: boolean;
  fields?: FieldInput[];
  /** rows keyed by field index into `fields` */
  rows?: unknown[][];
}

export async function createTable(ex: Executor, baseId: string, name: string, actor: Actor, opts: CreateTableOpts = {}) {
  const existing = await ex.select().from(schema.tables).where(eq(schema.tables.baseId, baseId));
  const tableId = newId("tbl");
  const tableName = uniqueName(name, existing.map((t) => t.name));

  let inputs: FieldInput[] = opts.fields?.length
    ? opts.fields
    : opts.withSampleFields
      ? [
          { name: "Name", type: "text" },
          { name: "Notes", type: "longText" },
          {
            name: "Status",
            type: "singleSelect",
            options: {
              choices: [
                { name: "Todo", color: "red" },
                { name: "In progress", color: "yellow" },
                { name: "Done", color: "green" },
              ],
            },
          },
        ]
      : [{ name: "Name", type: "text" }];
  // primary field cannot be a link etc.
  if (NO_PRIMARY.includes(inputs[0].type) || inputs[0].type === "formula") {
    inputs = [{ ...inputs[0], type: "text", options: {} }, ...inputs.slice(1)];
  }

  const taken: string[] = [];
  const fieldRows = inputs.map((f, i) => {
    const fname = uniqueName(f.name, taken);
    taken.push(fname);
    const type: FieldType = f.type === "link" ? "text" : f.type;
    return {
      id: newId("fld"),
      tableId,
      name: fname,
      type,
      options: normalizeOptions(type, f.options),
      description: f.description ?? "",
      position: i,
    };
  });

  await ex.insert(schema.tables).values({
    id: tableId,
    baseId,
    name: tableName,
    position: existing.length,
    primaryFieldId: fieldRows[0].id,
  });
  await ex.insert(schema.fields).values(fieldRows);
  await ex.insert(schema.views).values({ id: newId("viw"), tableId, name: "Grid view", type: "grid", config: {}, position: 0 });
  const table: Table = { id: tableId, baseId, name: tableName, position: existing.length, primaryFieldId: fieldRows[0].id };

  if (opts.rows?.length) {
    const fieldObjs = fieldRows.map((r) => ({ ...r, options: r.options }));
    await createRecords(
      ex,
      table,
      opts.rows.map((row) => ({
        fields: Object.fromEntries(fieldObjs.map((f, i) => [f.id, row[i] ?? null])),
      })),
      actor,
      { typecast: true },
    );
  } else if (opts.withSampleFields) {
    await createRecords(ex, table, [{ fields: {} }, { fields: {} }, { fields: {} }], actor);
  }
  await logSchema(ex, actor, baseId, tableId, "table.create");
  return table;
}

export async function renameTable(ex: Executor, table: Table, name: string, actor: Actor) {
  const others = await ex
    .select({ name: schema.tables.name })
    .from(schema.tables)
    .where(and(eq(schema.tables.baseId, table.baseId), sql`${schema.tables.id} <> ${table.id}`));
  const finalName = uniqueName(name, others.map((o) => o.name));
  await ex.update(schema.tables).set({ name: finalName }).where(eq(schema.tables.id, table.id));
  await logSchema(ex, actor, table.baseId, table.id, "table.rename");
}

export async function reorderTables(ex: Executor, baseId: string, order: string[], actor: Actor) {
  for (let i = 0; i < order.length; i++) {
    await ex
      .update(schema.tables)
      .set({ position: i })
      .where(and(eq(schema.tables.id, order[i]), eq(schema.tables.baseId, baseId)));
  }
  await logSchema(ex, actor, baseId, null, "table.reorder");
}

export async function deleteTable(ex: Executor, table: Table, actor: Actor) {
  const siblings = await ex.select({ id: schema.tables.id }).from(schema.tables).where(eq(schema.tables.baseId, table.baseId));
  if (siblings.length <= 1) throw badRequest("A base needs at least one table");
  // Remove link fields in other tables that point here.
  const siblingIds = siblings.map((s) => s.id).filter((id) => id !== table.id);
  if (siblingIds.length) {
    const linkFields = await ex
      .select()
      .from(schema.fields)
      .where(and(inArray(schema.fields.tableId, siblingIds), eq(schema.fields.type, "link")));
    for (const lf of linkFields) {
      if (lf.options.linkedTableId === table.id) {
        await ex.delete(schema.fields).where(eq(schema.fields.id, lf.id));
        await stripField(ex, lf.tableId, lf.id);
      }
    }
  }
  await ex.delete(schema.tables).where(eq(schema.tables.id, table.id));
  await logSchema(ex, actor, table.baseId, table.id, "table.delete");
}

// ------------------------------------------------------------------ fields

async function createInverseField(ex: Executor, source: Table, field: { id: string }, linkedTableId: string) {
  const linked = await getTable(ex, linkedTableId);
  if (linked.baseId !== source.baseId) throw badRequest("Can only link to tables in the same base");
  if (linked.id === source.id) return undefined; // self-links are one-way
  const taken = (await tableFields(ex, linked.id)).map((f) => f.name);
  const inverseId = newId("fld");
  await ex.insert(schema.fields).values({
    id: inverseId,
    tableId: linked.id,
    name: uniqueName(source.name, taken),
    type: "link",
    options: { linkedTableId: source.id, inverseFieldId: field.id },
    position: await nextPosition(ex, schema.fields, linked.id),
  });
  return inverseId;
}

export async function createField(ex: Executor, table: Table, input: FieldInput, actor: Actor): Promise<Field> {
  const fields = await tableFields(ex, table.id);
  const id = newId("fld");
  const options = normalizeOptions(input.type, input.options);
  if (input.type === "link") {
    if (!options.linkedTableId) throw badRequest("Choose a table to link to");
    options.inverseFieldId = await createInverseField(ex, table, { id }, options.linkedTableId);
  }
  const [row] = await ex
    .insert(schema.fields)
    .values({
      id,
      tableId: table.id,
      name: uniqueName(input.name, fields.map((f) => f.name)),
      type: input.type,
      options,
      description: input.description ?? "",
      position: await nextPosition(ex, schema.fields, table.id),
    })
    .returning();
  await logSchema(ex, actor, table.baseId, table.id, "field.create");
  return toField(row);
}

export const fieldPatchSchema = fieldInputSchema.partial();

export async function updateField(
  ex: Executor,
  table: Table,
  field: Field,
  patch: z.infer<typeof fieldPatchSchema>,
  actor: Actor,
): Promise<Field> {
  const fields = await tableFields(ex, table.id);
  const update: Partial<typeof schema.fields.$inferInsert> = {};
  if (patch.name !== undefined && patch.name !== field.name) {
    update.name = uniqueName(
      patch.name,
      fields.filter((f) => f.id !== field.id).map((f) => f.name),
    );
  }
  if (patch.description !== undefined) update.description = patch.description;

  const newType = patch.type ?? field.type;
  if (field.id === table.primaryFieldId && NO_PRIMARY.includes(newType)) {
    throw badRequest("The primary field can't be that type");
  }
  const typeChanged = newType !== field.type;
  const linkTargetChanged =
    newType === "link" && field.type === "link" && patch.options?.linkedTableId && patch.options.linkedTableId !== field.options.linkedTableId;

  if (patch.type !== undefined || patch.options !== undefined) {
    const prev = typeChanged || linkTargetChanged ? {} : field.options;
    const mergedInput = typeChanged ? patch.options : { ...field.options, ...(patch.options ?? {}) };
    const options = normalizeOptions(newType, mergedInput as z.infer<typeof fieldOptionsSchema>, prev);

    if (typeChanged || linkTargetChanged) {
      // Drop the old inverse link field, if any.
      if (field.type === "link" && field.options.inverseFieldId && field.options.linkedTableId) {
        await ex.delete(schema.fields).where(eq(schema.fields.id, field.options.inverseFieldId));
        await stripField(ex, field.options.linkedTableId, field.options.inverseFieldId);
      }
      if (newType === "link") {
        if (!options.linkedTableId) throw badRequest("Choose a table to link to");
        options.inverseFieldId = await createInverseField(ex, table, field, options.linkedTableId);
      }
      await convertFieldData(ex, table, field, { type: newType, options });
    } else if (newType === "singleSelect" || newType === "multiSelect") {
      // Strip removed choices from records.
      const kept = new Set((options.choices ?? []).map((c) => c.id));
      const removed = (field.options.choices ?? []).filter((c) => !kept.has(c.id));
      if (removed.length) await removeChoices(ex, table.id, field, kept);
    } else if (newType === "date" && !!options.includeTime !== !!field.options.includeTime) {
      await convertFieldData(ex, table, field, { type: newType, options });
    }
    update.type = newType;
    update.options = options;
  }

  const [row] = Object.keys(update).length
    ? await ex.update(schema.fields).set(update).where(eq(schema.fields.id, field.id)).returning()
    : await ex.select().from(schema.fields).where(eq(schema.fields.id, field.id));
  await logSchema(ex, actor, table.baseId, table.id, "field.update");
  return toField(row);
}

async function removeChoices(ex: Executor, tableId: string, field: Field, kept: Set<string>) {
  const rows = await listRecords(ex, tableId);
  for (const r of rows) {
    const v = r.data[field.id];
    if (v === undefined) continue;
    let next: unknown = v;
    if (field.type === "singleSelect") next = kept.has(v as string) ? v : null;
    else next = (v as string[]).filter((id) => kept.has(id));
    if (Array.isArray(next) && !next.length) next = null;
    if (JSON.stringify(next) === JSON.stringify(v)) continue;
    const data = { ...r.data };
    if (next === null) delete data[field.id];
    else data[field.id] = next;
    await ex.update(schema.records).set({ data }).where(eq(schema.records.id, r.id));
  }
}

async function convertFieldData(
  ex: Executor,
  table: Table,
  from: Field,
  to: { type: FieldType; options: FieldOptions },
) {
  if (isComputed(to.type)) {
    await stripField(ex, table.id, from.id);
    return;
  }
  const rows = await listRecords(ex, table.id);
  if ((to.type === "singleSelect" || to.type === "multiSelect") && from.type !== to.type) {
    const texts = rows.map((r) => cellToText(from, r.data[from.id] ?? null)).filter(Boolean);
    const choices = ensureChoices({ type: to.type, options: to.options }, texts);
    if (choices) to.options.choices = choices;
  }
  for (const r of rows) {
    const v = r.data[from.id];
    if (v === undefined) continue;
    const next = convertValue(from, to, v);
    const data = { ...r.data };
    if (next === null || next === undefined) delete data[from.id];
    else data[from.id] = next;
    await ex.update(schema.records).set({ data }).where(eq(schema.records.id, r.id));
  }
}

export async function deleteField(ex: Executor, table: Table, field: Field, actor: Actor) {
  if (field.id === table.primaryFieldId) throw badRequest("The primary field can't be deleted");
  if (field.type === "link" && field.options.inverseFieldId && field.options.linkedTableId) {
    await ex.delete(schema.fields).where(eq(schema.fields.id, field.options.inverseFieldId));
    await stripField(ex, field.options.linkedTableId, field.options.inverseFieldId);
  }
  await ex.delete(schema.fields).where(eq(schema.fields.id, field.id));
  await stripField(ex, table.id, field.id);
  await logSchema(ex, actor, table.baseId, table.id, "field.delete");
}

export async function setPrimaryField(ex: Executor, table: Table, field: Field, actor: Actor) {
  if (NO_PRIMARY.includes(field.type)) throw badRequest("That field type can't be the primary field");
  await ex.update(schema.tables).set({ primaryFieldId: field.id }).where(eq(schema.tables.id, table.id));
  await logSchema(ex, actor, table.baseId, table.id, "table.primary");
}

// ------------------------------------------------------------------ views

export const VIEW_TYPES: ViewType[] = ["grid", "kanban", "calendar", "gallery", "form"];

export async function createView(ex: Executor, table: Table, name: string, type: ViewType, actor: Actor, config?: ViewConfig) {
  const fields = await tableFields(ex, table.id);
  const cfg: ViewConfig = config ? structuredClone(config) : {};
  if (!config) {
    if (type === "kanban") cfg.kanbanFieldId = fields.find((f) => f.type === "singleSelect")?.id;
    if (type === "calendar") cfg.calendarFieldId = fields.find((f) => f.type === "date")?.id;
    if (type === "gallery") cfg.coverFieldId = fields.find((f) => f.type === "attachment")?.id;
    if (type === "form") {
      cfg.form = {
        title: table.name,
        fieldIds: fields.filter((f) => !isComputed(f.type)).map((f) => f.id),
        required: [],
        public: false,
      };
    }
  }
  const [row] = await ex
    .insert(schema.views)
    .values({ id: newId("viw"), tableId: table.id, name, type, config: cfg, position: await nextPosition(ex, schema.views, table.id) })
    .returning();
  await logSchema(ex, actor, table.baseId, table.id, "view.create");
  return toView(row);
}

export async function updateView(ex: Executor, table: Table, view: View, patch: { name?: string; config?: ViewConfig }, actor: Actor) {
  const update: Partial<typeof schema.views.$inferInsert> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.config !== undefined) update.config = { ...view.config, ...patch.config };
  const [row] = await ex.update(schema.views).set(update).where(eq(schema.views.id, view.id)).returning();
  await logSchema(ex, actor, table.baseId, table.id, "view.update");
  return toView(row);
}

export async function deleteView(ex: Executor, table: Table, view: View, actor: Actor) {
  const views = await ex.select({ id: schema.views.id }).from(schema.views).where(eq(schema.views.tableId, table.id));
  if (views.length <= 1) throw badRequest("A table needs at least one view");
  await ex.delete(schema.views).where(eq(schema.views.id, view.id));
  await logSchema(ex, actor, table.baseId, table.id, "view.delete");
}
