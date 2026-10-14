import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBaseRole, requireUser } from "@/server/access";
import { route } from "@/server/http";

type P = { baseId: string };

/** Realtime change feed: clients poll with ?since=<seq>. */
export const GET = route<P>(async (req, { baseId }) => {
  const user = await requireUser();
  await requireBaseRole(user.id, baseId, "viewer");
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0) || 0;
  const rows = await db
    .select({
      seq: schema.activity.seq,
      kind: schema.activity.kind,
      tableId: schema.activity.tableId,
      recordId: schema.activity.recordId,
      clientId: schema.activity.clientId,
    })
    .from(schema.activity)
    .where(and(eq(schema.activity.baseId, baseId), gt(schema.activity.seq, since)))
    .orderBy(asc(schema.activity.seq))
    .limit(1000);
  return { latest: rows.length ? rows[rows.length - 1].seq : since, changes: rows, more: rows.length === 1000 };
});
