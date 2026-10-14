import { z } from "zod";
import { db } from "@/db";
import { requireBaseRole, requireUser } from "@/server/access";
import { clientIdOf, readJson, route } from "@/server/http";
import { createTable, fieldInputSchema, reorderTables } from "@/server/schema-service";

type P = { baseId: string };

const body = z.object({
  name: z.string().trim().min(1).max(255),
  fields: z.array(fieldInputSchema).max(500).optional(),
  rows: z.array(z.array(z.unknown())).max(50_000).optional(),
});

export const POST = route<P>(async (req, { baseId }) => {
  const user = await requireUser();
  await requireBaseRole(user.id, baseId, "creator");
  const input = body.parse(await readJson(req));
  const actor = { userId: user.id, clientId: clientIdOf(req) };
  const table = await db.transaction((tx) =>
    createTable(tx, baseId, input.name, actor, {
      fields: input.fields,
      rows: input.rows,
      withSampleFields: !input.fields,
    }),
  );
  return { table };
});

export const PATCH = route<P>(async (req, { baseId }) => {
  const user = await requireUser();
  await requireBaseRole(user.id, baseId, "creator");
  const input = z.object({ order: z.array(z.string()) }).parse(await readJson(req));
  await db.transaction((tx) => reorderTables(tx, baseId, input.order, { userId: user.id, clientId: clientIdOf(req) }));
  return { ok: true };
});
