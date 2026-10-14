import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/ids";

export function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/** Emails aren't verified, so production setups with Google SSO should set DISABLE_PASSWORD_SIGNUP=true. */
export function passwordSignupEnabled(): boolean {
  return process.env.DISABLE_PASSWORD_SIGNUP !== "true";
}

export function emailAllowed(email: string): boolean {
  const domains = allowedDomains();
  if (!domains.length) return true;
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return domains.includes(domain);
}

/** Turn pending base invites for this email into memberships. */
export async function claimInvites(userId: string, email: string) {
  const invites = await db.select().from(schema.baseInvites).where(eq(schema.baseInvites.email, email));
  if (!invites.length) return;
  await db
    .insert(schema.baseMembers)
    .values(invites.map((i) => ({ baseId: i.baseId, userId, role: i.role })))
    .onConflictDoNothing();
  await db.delete(schema.baseInvites).where(eq(schema.baseInvites.email, email));
}

export async function ensureUser(input: { email: string; name: string; image: string | null; passwordHash?: string }) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    if (!existing.image && input.image) {
      await db.update(schema.users).set({ image: input.image }).where(eq(schema.users.id, existing.id));
    }
    await claimInvites(existing.id, email);
    return existing;
  }
  const [created] = await db
    .insert(schema.users)
    .values({
      id: newId("usr"),
      email,
      name: input.name || email.split("@")[0],
      image: input.image,
      passwordHash: input.passwordHash ?? null,
    })
    .returning();
  await claimInvites(created.id, email);
  return created;
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<string | null> {
  const { default: bcrypt } = await import("bcryptjs");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) return "Please enter your name";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Please enter a valid email";
  if (input.password.length < 8) return "Password must be at least 8 characters";
  if (!emailAllowed(email)) return `Sign-ups are restricted to ${allowedDomains().map((d) => "@" + d).join(", ")} addresses`;
  if (!passwordSignupEnabled()) return "Password sign-up is disabled. Use your company Google account.";
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  // Never attach a password to an existing (e.g. SSO) account: there is no email verification.
  if (existing) return "An account with that email already exists";
  const passwordHash = await bcrypt.hash(input.password, 10);
  await ensureUser({ email, name, image: null, passwordHash });
  return null;
}
