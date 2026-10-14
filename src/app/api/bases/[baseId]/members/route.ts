import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ROLES, type Role } from "@/lib/types";
import { requireBaseRole, requireUser } from "@/server/access";
import { logSchema } from "@/server/activity";
import { badRequest, clientIdOf, readJson, route } from "@/server/http";
import { emailAllowed } from "@/server/users";

type P = { baseId: string };
const roleSchema = z.enum(ROLES as [Role, ...Role[]]);

async function ownerCount(baseId: string) {
  const owners = await db
    .select()
    .from(schema.baseMembers)
    .where(and(eq(schema.baseMembers.baseId, baseId), eq(schema.baseMembers.role, "owner")));
  return owners.length;
}

/** Invite by email: adds existing users directly, otherwise stores a pending invite. */
export const POST = route<P>(async (req, { baseId }) => {
  const user = await requireUser();
  await requireBaseRole(user.id, baseId, "owner");
  const input = z
    .object({ email: z.string().trim().toLowerCase().email(), role: roleSchema })
    .parse(await readJson(req));
  if (!emailAllowed(input.email)) throw badRequest("That email domain isn't allowed");
  const [target] = await db.select().from(schema.users).where(eq(schema.users.email, input.email));
  if (target) {
    await db
      .insert(schema.baseMembers)
      .values({ baseId, userId: target.id, role: input.role })
      .onConflictDoUpdate({ target: [schema.baseMembers.baseId, schema.baseMembers.userId], set: { role: input.role } });
  } else {
    await db
      .insert(schema.baseInvites)
      .values({ baseId, email: input.email, role: input.role, invitedBy: user.id })
      .onConflictDoUpdate({ target: [schema.baseInvites.baseId, schema.baseInvites.email], set: { role: input.role } });
  }
  await logSchema(db, { userId: user.id, clientId: clientIdOf(req) }, baseId, null, "members");
  return { ok: true, pending: !target };
});

export const PATCH = route<P>(async (req, { baseId }) => {
  const user = await requireUser();
  await requireBaseRole(user.id, baseId, "owner");
  const input = z
    .object({ userId: z.string().optional(), email: z.string().optional(), role: roleSchema })
    .parse(await readJson(req));
  if (input.userId) {
    const [current] = await db
      .select()
      .from(schema.baseMembers)
      .where(and(eq(schema.baseMembers.baseId, baseId), eq(schema.baseMembers.userId, input.userId)));
    if (current?.role === "owner" && input.role !== "owner" && (await ownerCount(baseId)) <= 1) {
      throw badRequest("A base needs at least one owner");
    }
    await db
      .update(schema.baseMembers)
      .set({ role: input.role })
      .where(and(eq(schema.baseMembers.baseId, baseId), eq(schema.baseMembers.userId, input.userId)));
  } else if (input.email) {
    await db
      .update(schema.baseInvites)
      .set({ role: input.role })
      .where(and(eq(schema.baseInvites.baseId, baseId), eq(schema.baseInvites.email, input.email)));
  }
  await logSchema(db, { userId: user.id, clientId: clientIdOf(req) }, baseId, null, "members");
  return { ok: true };
});

export const DELETE = route<P>(async (req, { baseId }) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const email = url.searchParams.get("email");
  // Anyone may leave a base; only owners may remove others.
  if (userId !== user.id) await requireBaseRole(user.id, baseId, "owner");
  else await requireBaseRole(user.id, baseId, "viewer");
  if (userId) {
    const [current] = await db
      .select()
      .from(schema.baseMembers)
      .where(and(eq(schema.baseMembers.baseId, baseId), eq(schema.baseMembers.userId, userId)));
    if (current?.role === "owner" && (await ownerCount(baseId)) <= 1) throw badRequest("A base needs at least one owner");
    await db.delete(schema.baseMembers).where(and(eq(schema.baseMembers.baseId, baseId), eq(schema.baseMembers.userId, userId)));
  } else if (email) {
    await db.delete(schema.baseInvites).where(and(eq(schema.baseInvites.baseId, baseId), eq(schema.baseInvites.email, email)));
  }
  await logSchema(db, { userId: user.id, clientId: clientIdOf(req) }, baseId, null, "members");
  return { ok: true };
});
