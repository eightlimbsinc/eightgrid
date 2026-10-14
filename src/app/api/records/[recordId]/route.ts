import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ActivityEntry, Comment } from "@/lib/types";
import { requireRecord, requireUser } from "@/server/access";
import { route } from "@/server/http";
import { toRecord } from "@/server/serialize";

type P = { recordId: string };

/** A record with its comments and change history (for the expanded record view). */
export const GET = route<P>(async (_req, { recordId }) => {
  const user = await requireUser();
  const { record } = await requireRecord(user.id, recordId, "viewer");
  const [comments, history] = await Promise.all([
    db
      .select({
        id: schema.comments.id,
        recordId: schema.comments.recordId,
        userId: schema.comments.userId,
        userName: schema.users.name,
        body: schema.comments.body,
        createdAt: schema.comments.createdAt,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.userId))
      .where(eq(schema.comments.recordId, recordId))
      .orderBy(schema.comments.createdAt),
    db
      .select({
        seq: schema.activity.seq,
        kind: schema.activity.kind,
        actorId: schema.activity.actorId,
        actorName: schema.users.name,
        payload: schema.activity.payload,
        createdAt: schema.activity.createdAt,
      })
      .from(schema.activity)
      .leftJoin(schema.users, eq(schema.users.id, schema.activity.actorId))
      .where(
        and(eq(schema.activity.recordId, recordId), inArray(schema.activity.kind, ["record.create", "record.update"])),
      )
      .orderBy(desc(schema.activity.seq))
      .limit(100),
  ]);
  return {
    record: toRecord(record),
    comments: comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })) satisfies Comment[],
    history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })) satisfies ActivityEntry[],
  };
});
