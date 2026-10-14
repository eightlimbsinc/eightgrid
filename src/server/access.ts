import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasRole, type Role } from "@/lib/types";
import { auth } from "./auth";
import { forbidden, HttpError, notFound } from "./http";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  return u;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Authenticate a public API request via `Authorization: Bearer <token>`. Falls back to the session. */
export async function requireApiUser(req: Request): Promise<SessionUser> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    const u = await currentUser();
    if (u) return u;
    throw new HttpError(401, "Missing API token. Send `Authorization: Bearer <token>`.");
  }
  const [row] = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, tokenId: schema.apiTokens.id })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
    .where(eq(schema.apiTokens.tokenHash, hashToken(m[1].trim())));
  if (!row) throw new HttpError(401, "Invalid API token");
  await db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row.tokenId));
  return { id: row.id, email: row.email, name: row.name };
}

export async function getRole(userId: string, baseId: string): Promise<Role | null> {
  const [m] = await db
    .select({ role: schema.baseMembers.role })
    .from(schema.baseMembers)
    .where(and(eq(schema.baseMembers.baseId, baseId), eq(schema.baseMembers.userId, userId)));
  return (m?.role as Role) ?? null;
}

export async function requireBaseRole(userId: string, baseId: string, min: Role): Promise<Role> {
  const role = await getRole(userId, baseId);
  if (!role) throw notFound("Base not found");
  if (!hasRole(role, min)) throw forbidden();
  return role;
}

export async function loadTable(tableId: string) {
  const [t] = await db.select().from(schema.tables).where(eq(schema.tables.id, tableId));
  if (!t) throw notFound("Table not found");
  return t;
}

export async function requireTable(userId: string, tableId: string, min: Role) {
  const table = await loadTable(tableId);
  const role = await requireBaseRole(userId, table.baseId, min);
  return { table, role };
}

export async function requireField(userId: string, fieldId: string, min: Role) {
  const [field] = await db.select().from(schema.fields).where(eq(schema.fields.id, fieldId));
  if (!field) throw notFound("Field not found");
  const { table, role } = await requireTable(userId, field.tableId, min);
  return { field, table, role };
}

export async function requireView(userId: string, viewId: string, min: Role) {
  const [view] = await db.select().from(schema.views).where(eq(schema.views.id, viewId));
  if (!view) throw notFound("View not found");
  const { table, role } = await requireTable(userId, view.tableId, min);
  return { view, table, role };
}

export async function requireRecord(userId: string, recordId: string, min: Role) {
  const [record] = await db.select().from(schema.records).where(eq(schema.records.id, recordId));
  if (!record) throw notFound("Record not found");
  const { table, role } = await requireTable(userId, record.tableId, min);
  return { record, table, role };
}
