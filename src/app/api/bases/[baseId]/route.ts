import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { COLORS } from "@/lib/fields";
import { requireBaseRole, requireUser } from "@/server/access";
import { logSchema } from "@/server/activity";
import { clientIdOf, readJson, route } from "@/server/http";
import { loadBasePayload } from "@/server/schema-service";

type P = { baseId: string };

export const GET = route<P>(async (_req, { baseId }) => {
  const user = await requireUser();
  const role = await requireBaseRole(user.id, baseId, "viewer");
  return loadBasePayload(baseId, role);
});

const patch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: z.enum(COLORS).optional(),
});

export const PATCH = route<P>(async (req, { baseId }) => {
  const user = await requireUser();
  await requireBaseRole(user.id, baseId, "creator");
  const input = patch.parse(await readJson(req));
  await db.update(schema.bases).set(input).where(eq(schema.bases.id, baseId));
  await logSchema(db, { userId: user.id, clientId: clientIdOf(req) }, baseId, null, "base.update");
  return { ok: true };
});

export const DELETE = route<P>(async (_req, { baseId }) => {
  const user = await requireUser();
  await requireBaseRole(user.id, baseId, "owner");
  await db.delete(schema.bases).where(eq(schema.bases.id, baseId));
  return { ok: true };
});
