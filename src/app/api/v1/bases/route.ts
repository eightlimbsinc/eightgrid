import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApiUser } from "@/server/access";
import { route } from "@/server/http";

export const GET = route(async (req) => {
  const user = await requireApiUser(req);
  const rows = await db
    .select({ id: schema.bases.id, name: schema.bases.name, permissionLevel: schema.baseMembers.role })
    .from(schema.baseMembers)
    .innerJoin(schema.bases, eq(schema.bases.id, schema.baseMembers.baseId))
    .where(eq(schema.baseMembers.userId, user.id));
  return { bases: rows };
});
