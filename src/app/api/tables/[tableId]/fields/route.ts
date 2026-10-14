import { db } from "@/db";
import { requireTable, requireUser } from "@/server/access";
import { clientIdOf, readJson, route } from "@/server/http";
import { createField, fieldInputSchema } from "@/server/schema-service";
import { toTable } from "@/server/serialize";

type P = { tableId: string };

export const POST = route<P>(async (req, { tableId }) => {
  const user = await requireUser();
  const { table } = await requireTable(user.id, tableId, "creator");
  const input = fieldInputSchema.parse(await readJson(req));
  const field = await db.transaction((tx) =>
    createField(tx, toTable(table), input, { userId: user.id, clientId: clientIdOf(req) }),
  );
  return { field };
});
