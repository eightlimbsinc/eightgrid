import { z } from "zod";
import { db } from "@/db";
import { requireTable, requireUser } from "@/server/access";
import { badRequest, clientIdOf, readJson, route } from "@/server/http";
import { tableFields } from "@/server/records";
import { deleteTable, renameTable, setPrimaryField } from "@/server/schema-service";
import { toTable } from "@/server/serialize";

type P = { tableId: string };

const patch = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  primaryFieldId: z.string().optional(),
});

export const PATCH = route<P>(async (req, { tableId }) => {
  const user = await requireUser();
  const { table } = await requireTable(user.id, tableId, "creator");
  const input = patch.parse(await readJson(req));
  const actor = { userId: user.id, clientId: clientIdOf(req) };
  await db.transaction(async (tx) => {
    if (input.name) await renameTable(tx, toTable(table), input.name, actor);
    if (input.primaryFieldId) {
      const field = (await tableFields(tx, tableId)).find((f) => f.id === input.primaryFieldId);
      if (!field) throw badRequest("Unknown field");
      await setPrimaryField(tx, toTable(table), field, actor);
    }
  });
  return { ok: true };
});

export const DELETE = route<P>(async (req, { tableId }) => {
  const user = await requireUser();
  const { table } = await requireTable(user.id, tableId, "creator");
  await db.transaction((tx) => deleteTable(tx, toTable(table), { userId: user.id, clientId: clientIdOf(req) }));
  return { ok: true };
});
