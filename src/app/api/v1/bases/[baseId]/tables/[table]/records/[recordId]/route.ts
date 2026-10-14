import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { notFound, readJson, route } from "@/server/http";
import { deleteRecords, updateRecords } from "@/server/records";
import { toRecord } from "@/server/serialize";
import { inputFields, makeGetter, outputRecord, refreshFields, v1Context, type V1Context } from "@/server/v1";

type P = { baseId: string; table: string; recordId: string };

async function load(ctx: V1Context, recordId: string) {
  const [r] = await db
    .select()
    .from(schema.records)
    .where(and(eq(schema.records.id, recordId), eq(schema.records.tableId, ctx.table.id)));
  if (!r) throw notFound("Record not found");
  return toRecord(r);
}

export const GET = route<P>(async (req, { baseId, table, recordId }) => {
  const ctx = await v1Context(req, baseId, table, "viewer");
  return outputRecord(ctx, makeGetter(ctx), await load(ctx, recordId));
});

const body = z.object({ fields: z.record(z.string(), z.unknown()), typecast: z.boolean().optional() });

async function update(req: Request, { baseId, table, recordId }: P, replace: boolean) {
  const ctx = await v1Context(req, baseId, table, "editor");
  const input = body.parse(await readJson(req));
  await load(ctx, recordId);
  const [r] = await db.transaction((tx) =>
    updateRecords(tx, ctx.table, [{ id: recordId, fields: inputFields(ctx, input.fields) }], { userId: ctx.user.id, clientId: "api" }, {
      typecast: input.typecast,
      replace,
    }),
  );
  if (input.typecast) await refreshFields(ctx);
  return outputRecord(ctx, makeGetter(ctx), r);
}

export const PATCH = route<P>((req, p) => update(req, p, false));
export const PUT = route<P>((req, p) => update(req, p, true));

export const DELETE = route<P>(async (req, { baseId, table, recordId }) => {
  const ctx = await v1Context(req, baseId, table, "editor");
  await load(ctx, recordId);
  await db.transaction((tx) => deleteRecords(tx, ctx.table, [recordId], { userId: ctx.user.id, clientId: "api" }));
  return { id: recordId, deleted: true };
});
