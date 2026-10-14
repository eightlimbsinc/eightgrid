import { z } from "zod";
import { db, schema } from "@/db";
import { newId } from "@/lib/ids";
import { requireRecord, requireUser } from "@/server/access";
import { logActivity } from "@/server/activity";
import { clientIdOf, readJson, route } from "@/server/http";

type P = { recordId: string };

export const POST = route<P>(async (req, { recordId }) => {
  const user = await requireUser();
  const { table } = await requireRecord(user.id, recordId, "commenter");
  const input = z.object({ body: z.string().trim().min(1).max(10_000) }).parse(await readJson(req));
  const [comment] = await db
    .insert(schema.comments)
    .values({ id: newId("com"), recordId, userId: user.id, body: input.body })
    .returning();
  await logActivity(db, { userId: user.id, clientId: clientIdOf(req) }, {
    baseId: table.baseId,
    tableId: table.id,
    recordId,
    kind: "comment",
  });
  return { comment: { ...comment, userName: user.name, createdAt: comment.createdAt.toISOString() } };
});
