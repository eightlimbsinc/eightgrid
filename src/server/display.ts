import { eq, inArray } from "drizzle-orm";
import { db, schema, type Executor } from "@/db";
import { CellGetter } from "@/lib/compute";
import { listRecords, tableFields } from "./records";

/** Map of record id -> primary field text for a table. */
export async function primaryNames(ex: Executor, tableId: string): Promise<Map<string, string>> {
  const [table] = await ex.select().from(schema.tables).where(eq(schema.tables.id, tableId));
  if (!table) return new Map();
  const fields = await tableFields(ex, tableId);
  const primary = fields.find((f) => f.id === table.primaryFieldId);
  const records = await listRecords(ex, tableId);
  const getter = new CellGetter({ fields });
  return new Map(records.map((r) => [r.id, primary ? getter.text(r, primary) : r.id]));
}

export async function userNames(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.name]));
}
