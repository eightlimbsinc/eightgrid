import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { fieldTypeLabel } from "@/lib/fields";
import type { FieldType } from "@/lib/types";
import { requireApiUser, requireBaseRole } from "@/server/access";
import { route } from "@/server/http";

type P = { baseId: string };

/** Base schema: tables, fields and views. */
export const GET = route<P>(async (req, { baseId }) => {
  const user = await requireApiUser(req);
  await requireBaseRole(user.id, baseId, "viewer");
  const tables = await db.select().from(schema.tables).where(eq(schema.tables.baseId, baseId)).orderBy(asc(schema.tables.position));
  const ids = tables.map((t) => t.id);
  const [fields, views] = ids.length
    ? await Promise.all([
        db.select().from(schema.fields).where(inArray(schema.fields.tableId, ids)).orderBy(asc(schema.fields.position)),
        db.select().from(schema.views).where(inArray(schema.views.tableId, ids)).orderBy(asc(schema.views.position)),
      ])
    : [[], []];
  return {
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      primaryFieldId: t.primaryFieldId,
      fields: fields
        .filter((f) => f.tableId === t.id)
        .map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          typeLabel: fieldTypeLabel(f.type as FieldType),
          description: f.description,
          options: f.options,
        })),
      views: views.filter((v) => v.tableId === t.id).map((v) => ({ id: v.id, name: v.name, type: v.type })),
    })),
  };
});
