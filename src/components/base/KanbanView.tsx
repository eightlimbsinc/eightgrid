"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { createRecords, updateRecords } from "@/client/mutations";
import type { Choice } from "@/lib/types";
import { useBase } from "./context";
import { ChoiceChip } from "./cells";
import { RecordCard } from "./RecordCard";
import { useViewRecords } from "./useViewRecords";
import { Avatar } from "../ui";

export function KanbanView() {
  const { table, view, fields, base, canEdit, openRecord, patchView } = useBase();
  const { rows, vis, getter, loading } = useViewRecords();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const field = fields.find((f) => f.id === view.config.kanbanFieldId);
  const coverField = fields.find((f) => f.id === view.config.coverFieldId && f.type === "attachment");

  const columns = useMemo(() => {
    if (!field) return [];
    const cols: { key: string; label: React.ReactNode; value: string | null }[] = [
      { key: "__none", label: <span className="text-gray-500">Uncategorized</span>, value: null },
    ];
    if (field.type === "singleSelect") {
      for (const c of field.options.choices ?? []) cols.push({ key: c.id, label: <ChoiceChip choice={c as Choice} />, value: c.id });
    } else {
      for (const m of base.members)
        cols.push({
          key: m.userId,
          label: (
            <span className="flex items-center gap-1.5">
              <Avatar name={m.name} size={18} /> {m.name}
            </span>
          ),
          value: m.userId,
        });
    }
    return cols;
  }, [field, base.members]);

  if (!field) {
    const options = fields.filter((f) => f.type === "singleSelect" || f.type === "user");
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f8fa]">
        <div className="max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="mb-3 font-medium">Choose a field to stack records by</p>
          {options.length ? (
            <select className="input" value="" onChange={(e) => patchView({ kanbanFieldId: e.target.value })}>
              <option value="">Select a single select or user field…</option>
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-gray-500">Add a single select field to this table to use a Kanban view.</p>
          )}
        </div>
      </div>
    );
  }

  const ids = rows.map((r) => r.id);
  const byCol = new Map<string, typeof rows>();
  for (const c of columns) byCol.set(c.key, []);
  for (const r of rows) {
    const v = r.data[field.id] as string | undefined;
    const key = v && byCol.has(v) ? v : "__none";
    byCol.get(key)!.push(r);
  }

  return (
    <div className="absolute inset-0 overflow-x-auto bg-[#f7f8fa] p-4">
      {loading && <p className="text-gray-400">Loading…</p>}
      <div className="flex h-full items-start gap-3">
        {columns.map((col) => {
          const list = byCol.get(col.key) ?? [];
          if (col.key === "__none" && !list.length) return null;
          return (
            <div
              key={col.key}
              className={clsx(
                "flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-gray-100/80 transition",
                over === col.key && "ring-2 ring-blue-400",
              )}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => {
                setOver(null);
                if (!dragId) return;
                updateRecords(table.id, fields, [{ id: dragId, fields: { [field.id]: col.value } }]);
                setDragId(null);
              }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                {col.label}
                <span className="text-xs text-gray-500">{list.length}</span>
              </div>
              <div className="min-h-[40px] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {list.map((r) => (
                  <RecordCard
                    key={r.id}
                    record={r}
                    fields={vis}
                    getter={getter}
                    coverField={coverField}
                    skipFieldId={field.id}
                    draggable={canEdit}
                    onDragStart={() => setDragId(r.id)}
                    onOpen={() => openRecord(table.id, r.id, ids)}
                  />
                ))}
              </div>
              {canEdit && (
                <button
                  className="m-2 mt-0 flex items-center gap-1 rounded-md px-2 py-1.5 text-gray-500 hover:bg-gray-200"
                  onClick={async () => {
                    const [rec] = await createRecords(table.id, fields, [{ fields: col.value ? { [field.id]: col.value } : {} }]);
                    if (rec) openRecord(table.id, rec.id);
                  }}
                >
                  <Plus size={14} /> Add record
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
