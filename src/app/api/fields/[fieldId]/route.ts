import { db } from "@/db";
import { requireField, requireUser } from "@/server/access";
import { clientIdOf, readJson, route } from "@/server/http";
import { deleteField, fieldPatchSchema, updateField } from "@/server/schema-service";
import { toField, toTable } from "@/server/serialize";

type P = { fieldId: string };

export const PATCH = route<P>(async (req, { fieldId }) => {
  const user = await requireUser();
  const { field, table } = await requireField(user.id, fieldId, "creator");
  const input = fieldPatchSchema.parse(await readJson(req));
  const updated = await db.transaction((tx) =>
    updateField(tx, toTable(table), toField(field), input, { userId: user.id, clientId: clientIdOf(req) }),
  );
  return { field: updated };
});

export const DELETE = route<P>(async (req, { fieldId }) => {
  const user = await requireUser();
  const { field, table } = await requireField(user.id, fieldId, "creator");
  await db.transaction((tx) => deleteField(tx, toTable(table), toField(field), { userId: user.id, clientId: clientIdOf(req) }));
  return { ok: true };
});
