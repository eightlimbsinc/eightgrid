import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { newId, randomString } from "@/lib/ids";
import { hashToken, requireUser } from "@/server/access";
import { readJson, route } from "@/server/http";

export const GET = route(async () => {
  const user = await requireUser();
  const tokens = await db
    .select({
      id: schema.apiTokens.id,
      name: schema.apiTokens.name,
      prefix: schema.apiTokens.prefix,
      createdAt: schema.apiTokens.createdAt,
      lastUsedAt: schema.apiTokens.lastUsedAt,
    })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, user.id))
    .orderBy(desc(schema.apiTokens.createdAt));
  return { tokens };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = z.object({ name: z.string().trim().min(1).max(100) }).parse(await readJson(req));
  const token = `egt_${randomString(40)}`;
  const id = newId("tok");
  await db.insert(schema.apiTokens).values({
    id,
    userId: user.id,
    name: input.name,
    tokenHash: hashToken(token),
    prefix: token.slice(0, 10),
  });
  // The plaintext token is only ever returned once.
  return { id, token };
});
