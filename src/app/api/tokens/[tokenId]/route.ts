import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/access";
import { route } from "@/server/http";

type P = { tokenId: string };

export const DELETE = route<P>(async (_req, { tokenId }) => {
  const user = await requireUser();
  await db.delete(schema.apiTokens).where(and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, user.id)));
  return { ok: true };
});
