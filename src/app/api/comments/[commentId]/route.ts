import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireRecord, requireUser } from "@/server/access";
import { forbidden, notFound, route } from "@/server/http";

type P = { commentId: string };

export const DELETE = route<P>(async (_req, { commentId }) => {
  const user = await requireUser();
  const [comment] = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId));
  if (!comment) throw notFound();
  const { role } = await requireRecord(user.id, comment.recordId, "commenter");
  if (comment.userId !== user.id && role !== "owner") throw forbidden();
  await db.delete(schema.comments).where(eq(schema.comments.id, commentId));
  return { ok: true };
});
