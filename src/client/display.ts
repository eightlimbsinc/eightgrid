"use client";

import { CellGetter } from "@/lib/compute";
import type { BasePayload, Field, RecordRow } from "@/lib/types";
import { recordsStore } from "./store";

/**
 * Builds CellGetters for tables of a base. Link cells resolve to the linked record's
 * primary field text using whatever is in the records store.
 */
export class Resolver {
  private getters = new Map<string, CellGetter>();
  private indexes = new Map<string, Map<string, RecordRow>>();
  private userNames: Map<string, string>;

  constructor(private base: BasePayload) {
    this.userNames = new Map(base.members.map((m) => [m.userId, m.name]));
  }

  fieldsOf(tableId: string): Field[] {
    return this.base.fields.filter((f) => f.tableId === tableId);
  }

  getter(tableId: string): CellGetter {
    let g = this.getters.get(tableId);
    if (!g) {
      g = new CellGetter({
        fields: this.fieldsOf(tableId),
        userName: (id) => this.userNames.get(id),
        linkName: (tid, rid) => this.linkName(tid, rid),
      });
      this.getters.set(tableId, g);
    }
    return g;
  }

  record(tableId: string, recordId: string): RecordRow | undefined {
    let idx = this.indexes.get(tableId);
    if (!idx) {
      idx = new Map(recordsStore.records(tableId).map((r) => [r.id, r]));
      this.indexes.set(tableId, idx);
    }
    return idx.get(recordId);
  }

  primaryText(tableId: string, record: RecordRow): string {
    const table = this.base.tables.find((t) => t.id === tableId);
    const primary = this.base.fields.find((f) => f.id === table?.primaryFieldId);
    if (!primary) return record.id;
    // Avoid infinite recursion if the primary field is a link-y formula
    if (primary.type === "link") return record.id;
    return this.getter(tableId).text(record, primary);
  }

  linkName(tableId: string, recordId: string): string {
    const r = this.record(tableId, recordId);
    if (!r) return "…";
    return this.primaryText(tableId, r) || "Unnamed record";
  }

  userName(id: string) {
    return this.userNames.get(id);
  }
}
