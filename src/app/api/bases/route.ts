import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { COLORS } from "@/lib/fields";
import { requireUser } from "@/server/access";
import { clientIdOf, readJson, route } from "@/server/http";
import { createBase } from "@/server/schema-service";

export const GET = route(async () => {
  const user = await requireUser();
  const rows = await db
    .select({ id: schema.bases.id, name: schema.bases.name, color: schema.bases.color, role: schema.baseMembers.role })
    .from(schema.baseMembers)
    .innerJoin(schema.bases, eq(schema.bases.id, schema.baseMembers.baseId))
    .where(eq(schema.baseMembers.userId, user.id))
    .orderBy(desc(schema.bases.createdAt));
  return { bases: rows };
});

const body = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.enum(COLORS).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = body.parse(await readJson(req));
  return createBase(user.id, input.name, input.color ?? "blue", { userId: user.id, clientId: clientIdOf(req) });
});
