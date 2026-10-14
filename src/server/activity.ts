import { schema, type Executor } from "@/db";

export interface Actor {
  userId: string | null;
  clientId: string | null;
}

export interface ActivityInput {
  baseId: string;
  tableId?: string | null;
  recordId?: string | null;
  kind: string;
  payload?: Record<string, unknown>;
}

export async function logActivity(ex: Executor, actor: Actor, entries: ActivityInput | ActivityInput[]) {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return;
  // Chunk to stay well under Postgres' parameter limit on big imports.
  for (let i = 0; i < list.length; i += 500) {
    await ex.insert(schema.activity).values(
      list.slice(i, i + 500).map((e) => ({
        baseId: e.baseId,
        tableId: e.tableId ?? null,
        recordId: e.recordId ?? null,
        kind: e.kind,
        payload: e.payload ?? {},
        actorId: actor.userId,
        clientId: actor.clientId,
      })),
    );
  }
}

/** Shorthand for structural changes that make clients reload the base schema. */
export function logSchema(ex: Executor, actor: Actor, baseId: string, tableId: string | null, what: string) {
  return logActivity(ex, actor, { baseId, tableId, kind: "schema", payload: { what } });
}
