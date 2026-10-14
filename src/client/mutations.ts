"use client";

import { toastError } from "@/components/ui";
import type { Field, RecordRow } from "@/lib/types";
import { api } from "./api";
import { recordsStore } from "./store";

function linkedTablesOf(fields: Field[], fieldIds: Iterable<string>): string[] {
  const ids = new Set(fieldIds);
  return [
    ...new Set(
      fields
        .filter((f) => ids.has(f.id) && f.type === "link" && f.options.linkedTableId)
        .map((f) => f.options.linkedTableId!),
    ),
  ];
}

/** Update cells optimistically, then reconcile with the server. */
export async function updateRecords(
  tableId: string,
  fields: Field[],
  updates: { id: string; fields: Record<string, unknown> }[],
  opts: { typecast?: boolean } = {},
): Promise<RecordRow[] | null> {
  if (!updates.length) return [];
  const byId = new Map(updates.map((u) => [u.id, u.fields]));
  const now = new Date().toISOString();
  // With typecast the server interprets raw text (e.g. select names), so skip the optimistic write.
  if (!opts.typecast) recordsStore.update(tableId, (list) =>
    list.map((r) => {
      const patch = byId.get(r.id);
      if (!patch) return r;
      const data = { ...r.data };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) delete data[k];
        else data[k] = v;
      }
      return { ...r, data, updatedAt: now };
    }),
  );
  try {
    const res = await api<{ records: RecordRow[] }>(`/api/tables/${tableId}/records`, {
      method: "PATCH",
      body: { records: updates, typecast: opts.typecast },
    });
    recordsStore.upsert(tableId, res.records);
    const changedFields = new Set(updates.flatMap((u) => Object.keys(u.fields)));
    for (const t of linkedTablesOf(fields, changedFields)) recordsStore.load(t, true);
    return res.records;
  } catch (e) {
    toastError(e);
    recordsStore.load(tableId, true);
    return null;
  }
}

export async function createRecords(
  tableId: string,
  fields: Field[],
  items: { fields: Record<string, unknown>; position?: number }[],
  opts: { typecast?: boolean } = {},
): Promise<RecordRow[]> {
  try {
    const out: RecordRow[] = [];
    for (let i = 0; i < items.length; i += 500) {
      const res = await api<{ records: RecordRow[] }>(`/api/tables/${tableId}/records`, {
        body: { records: items.slice(i, i + 500), typecast: opts.typecast },
      });
      recordsStore.upsert(tableId, res.records);
      out.push(...res.records);
    }
    const used = new Set(items.flatMap((i) => Object.keys(i.fields)));
    for (const t of linkedTablesOf(fields, used)) recordsStore.load(t, true);
    return out;
  } catch (e) {
    toastError(e);
    return [];
  }
}

export async function deleteRecords(tableId: string, fields: Field[], ids: string[]) {
  if (!ids.length) return;
  recordsStore.remove(tableId, ids);
  try {
    for (let i = 0; i < ids.length; i += 1000) {
      await api(`/api/tables/${tableId}/records`, { method: "DELETE", body: { ids: ids.slice(i, i + 1000) } });
    }
    for (const t of linkedTablesOf(fields, fields.map((f) => f.id))) recordsStore.load(t, true);
  } catch (e) {
    toastError(e);
    recordsStore.load(tableId, true);
  }
}

export async function moveRecord(tableId: string, id: string, position: number) {
  recordsStore.update(tableId, (list) => list.map((r) => (r.id === id ? { ...r, position } : r)));
  try {
    await api(`/api/tables/${tableId}/records`, { method: "PATCH", body: { records: [{ id, position }] } });
  } catch (e) {
    toastError(e);
    recordsStore.load(tableId, true);
  }
}

/** Position halfway between neighbours, for inserting rows above/below. */
export function positionBetween(records: RecordRow[], index: number, where: "above" | "below"): number {
  const sorted = [...records].sort((a, b) => a.position - b.position);
  const i = sorted.findIndex((r) => r.id === records[index]?.id);
  if (i < 0) return (sorted[sorted.length - 1]?.position ?? 0) + 1;
  const here = sorted[i].position;
  if (where === "above") {
    const prev = sorted[i - 1]?.position ?? here - 2;
    return (prev + here) / 2;
  }
  const next = sorted[i + 1]?.position ?? here + 2;
  return (here + next) / 2;
}
