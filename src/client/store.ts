"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { RecordRow } from "@/lib/types";
import { api } from "./api";

interface TableState {
  records: RecordRow[];
  loaded: boolean;
  loading: boolean;
  /** bumped on every change so selectors can memoize */
  version: number;
}

/** Client cache of every loaded table's records, shared across views. */
class RecordsStore {
  private tables = new Map<string, TableState>();
  private listeners = new Set<() => void>();
  private snapshot = 0;
  private pending = new Map<string, Promise<void>>();
  private reloadQueued = new Set<string>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot++;
    this.listeners.forEach((l) => l());
  }

  get(tableId: string): TableState | undefined {
    return this.tables.get(tableId);
  }

  records(tableId: string): RecordRow[] {
    return this.tables.get(tableId)?.records ?? [];
  }

  isLoaded(tableId: string) {
    return !!this.tables.get(tableId)?.loaded;
  }

  load(tableId: string, force = false): Promise<void> {
    const existing = this.tables.get(tableId);
    if (existing?.loaded && !force) return Promise.resolve();
    const inflight = this.pending.get(tableId);
    if (inflight) {
      // A reload was requested while loading: run once more afterwards to pick up the latest data.
      if (force && !this.reloadQueued.has(tableId)) {
        this.reloadQueued.add(tableId);
        return inflight.then(() => {
          this.reloadQueued.delete(tableId);
          return this.load(tableId, true);
        });
      }
      return inflight;
    }
    if (!existing) this.tables.set(tableId, { records: [], loaded: false, loading: true, version: 0 });
    const p = api<{ records: RecordRow[] }>(`/api/tables/${tableId}/records`)
      .then(({ records }) => {
        const prev = this.tables.get(tableId);
        this.tables.set(tableId, { records, loaded: true, loading: false, version: (prev?.version ?? 0) + 1 });
        this.emit();
      })
      .finally(() => this.pending.delete(tableId));
    this.pending.set(tableId, p);
    return p;
  }

  update(tableId: string, fn: (records: RecordRow[]) => RecordRow[]) {
    const s = this.tables.get(tableId);
    if (!s) return;
    this.tables.set(tableId, { ...s, records: fn(s.records), version: s.version + 1 });
    this.emit();
  }

  upsert(tableId: string, rows: RecordRow[]) {
    if (!rows.length) return;
    const byId = new Map(rows.map((r) => [r.id, r]));
    this.update(tableId, (list) => {
      const seen = new Set<string>();
      const next = list.map((r) => {
        const n = byId.get(r.id);
        if (n) seen.add(r.id);
        return n ?? r;
      });
      for (const r of rows) if (!seen.has(r.id)) next.push(r);
      return next;
    });
  }

  remove(tableId: string, ids: string[]) {
    const set = new Set(ids);
    this.update(tableId, (list) => list.filter((r) => !set.has(r.id)));
  }

  forget(tableId: string) {
    this.tables.delete(tableId);
    this.emit();
  }

  loadedTables(): string[] {
    return [...this.tables.entries()].filter(([, s]) => s.loaded).map(([id]) => id);
  }
}

export const recordsStore = new RecordsStore();

/** Subscribe to records for the given tables, loading them on demand. */
export function useTables(tableIds: string[]): { records: Map<string, RecordRow[]>; loading: boolean; version: string } {
  useSyncExternalStore(recordsStore.subscribe, recordsStore.getSnapshot, recordsStore.getSnapshot);
  const key = tableIds.join(",");
  useEffect(() => {
    for (const id of tableIds) recordsStore.load(id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const records = new Map<string, RecordRow[]>();
  let loading = false;
  const versions: number[] = [];
  for (const id of tableIds) {
    const s = recordsStore.get(id);
    records.set(id, s?.records ?? []);
    versions.push(s?.version ?? -1);
    if (!s?.loaded) loading = true;
  }
  return { records, loading, version: versions.join(",") };
}
