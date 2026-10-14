import type { schema } from "@/db";
import type { Field, FieldType, RecordRow, Table, View, ViewType } from "@/lib/types";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export function toTable(t: Row<typeof schema.tables>): Table {
  return { id: t.id, baseId: t.baseId, name: t.name, position: t.position, primaryFieldId: t.primaryFieldId };
}

export function toField(f: Row<typeof schema.fields>): Field {
  return {
    id: f.id,
    tableId: f.tableId,
    name: f.name,
    type: f.type as FieldType,
    options: f.options ?? {},
    description: f.description,
    position: f.position,
  };
}

export function toView(v: Row<typeof schema.views>): View {
  return { id: v.id, tableId: v.tableId, name: v.name, type: v.type as ViewType, config: v.config ?? {}, position: v.position };
}

export function toRecord(r: Row<typeof schema.records>): RecordRow {
  return {
    id: r.id,
    tableId: r.tableId,
    data: r.data ?? {},
    position: r.position,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
  };
}
