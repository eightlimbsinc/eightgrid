import { z } from "zod";
import { db } from "@/db";
import { badRequest, readJson, route } from "@/server/http";
import { createRecords, deleteRecords, listRecords, updateRecords } from "@/server/records";
import { inputFields, listV1, makeGetter, outputRecord, parseListParams, refreshFields, v1Context } from "@/server/v1";

type P = { baseId: string; table: string };

const MAX = 100;

export const GET = route<P>(async (req, { baseId, table }) => {
  const ctx = await v1Context(req, baseId, table, "viewer");
  return listV1(ctx, await listRecords(db, ctx.table.id), parseListParams(ctx, new URL(req.url)));
});

const createBody = z.union([
  z.object({ records: z.array(z.object({ fields: z.record(z.string(), z.unknown()) })).min(1).max(MAX), typecast: z.boolean().optional() }),
  z.object({ fields: z.record(z.string(), z.unknown()), typecast: z.boolean().optional() }),
]);

export const POST = route<P>(async (req, { baseId, table }) => {
  const ctx = await v1Context(req, baseId, table, "editor");
  const body = createBody.parse(await readJson(req));
  const items = "records" in body ? body.records : [{ fields: body.fields }];
  const created = await db.transaction((tx) =>
    createRecords(
      tx,
      ctx.table,
      items.map((i) => ({ fields: inputFields(ctx, i.fields) })),
      { userId: ctx.user.id, clientId: "api" },
      { typecast: body.typecast },
    ),
  );
  if (body.typecast) await refreshFields(ctx);
  const getter = makeGetter(ctx);
  const out = created.map((r) => outputRecord(ctx, getter, r));
  return "records" in body ? { records: out } : out[0];
});

const updateBody = z.object({
  records: z.array(z.object({ id: z.string(), fields: z.record(z.string(), z.unknown()) })).min(1).max(MAX),
  typecast: z.boolean().optional(),
});

async function update(req: Request, { baseId, table }: P, replace: boolean) {
  const ctx = await v1Context(req, baseId, table, "editor");
  const body = updateBody.parse(await readJson(req));
  const updated = await db.transaction((tx) =>
    updateRecords(
      tx,
      ctx.table,
      body.records.map((r) => ({ id: r.id, fields: inputFields(ctx, r.fields) })),
      { userId: ctx.user.id, clientId: "api" },
      { typecast: body.typecast, replace },
    ),
  );
  if (body.typecast) await refreshFields(ctx);
  const getter = makeGetter(ctx);
  return { records: updated.map((r) => outputRecord(ctx, getter, r)) };
}

export const PATCH = route<P>((req, p) => update(req, p, false));
export const PUT = route<P>((req, p) => update(req, p, true));

export const DELETE = route<P>(async (req, { baseId, table }) => {
  const ctx = await v1Context(req, baseId, table, "editor");
  const url = new URL(req.url);
  const ids = [...url.searchParams.getAll("records[]"), ...url.searchParams.getAll("records")];
  if (!ids.length) throw badRequest("Pass record ids as ?records[]=recXXX");
  if (ids.length > MAX) throw badRequest(`At most ${MAX} records per request`);
  const deleted = await db.transaction((tx) => deleteRecords(tx, ctx.table, ids, { userId: ctx.user.id, clientId: "api" }));
  return { records: deleted.map((id) => ({ id, deleted: true })) };
});
