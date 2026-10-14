import { z } from "zod";
import { db } from "@/db";
import { requireTable, requireUser } from "@/server/access";
import { clientIdOf, readJson, route } from "@/server/http";
import { createRecords, deleteRecords, listRecords, moveRecord, updateRecords } from "@/server/records";
import { toTable } from "@/server/serialize";

type P = { tableId: string };

export const GET = route<P>(async (_req, { tableId }) => {
  const user = await requireUser();
  await requireTable(user.id, tableId, "viewer");
  return { records: await listRecords(db, tableId) };
});

const createBody = z.object({
  records: z.array(z.object({ fields: z.record(z.string(), z.unknown()).default({}), position: z.number().optional() })).min(1),
  typecast: z.boolean().optional(),
});

export const POST = route<P>(async (req, { tableId }) => {
  const user = await requireUser();
  const { table } = await requireTable(user.id, tableId, "editor");
  const input = createBody.parse(await readJson(req));
  const records = await db.transaction((tx) =>
    createRecords(tx, toTable(table), input.records, { userId: user.id, clientId: clientIdOf(req) }, { typecast: input.typecast }),
  );
  return { records };
});

const updateBody = z.object({
  records: z
    .array(
      z.object({
        id: z.string(),
        fields: z.record(z.string(), z.unknown()).optional(),
        position: z.number().optional(),
      }),
    )
    .min(1),
  typecast: z.boolean().optional(),
});

export const PATCH = route<P>(async (req, { tableId }) => {
  const user = await requireUser();
  const { table } = await requireTable(user.id, tableId, "editor");
  const input = updateBody.parse(await readJson(req));
  const actor = { userId: user.id, clientId: clientIdOf(req) };
  const t = toTable(table);
  const records = await db.transaction(async (tx) => {
    for (const r of input.records) if (r.position !== undefined) await moveRecord(tx, t, r.id, r.position, actor);
    const withFields = input.records.filter((r) => r.fields && Object.keys(r.fields).length);
    return updateRecords(
      tx,
      t,
      withFields.map((r) => ({ id: r.id, fields: r.fields! })),
      actor,
      { typecast: input.typecast },
    );
  });
  return { records };
});

export const DELETE = route<P>(async (req, { tableId }) => {
  const user = await requireUser();
  const { table } = await requireTable(user.id, tableId, "editor");
  const input = z.object({ ids: z.array(z.string()).min(1) }).parse(await readJson(req));
  const deleted = await db.transaction((tx) =>
    deleteRecords(tx, toTable(table), input.ids, { userId: user.id, clientId: clientIdOf(req) }),
  );
  return { deleted };
});
