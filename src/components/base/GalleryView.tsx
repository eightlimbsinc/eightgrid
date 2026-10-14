"use client";

import { Plus } from "lucide-react";
import { createRecords } from "@/client/mutations";
import { useBase } from "./context";
import { RecordCard } from "./RecordCard";
import { useViewRecords } from "./useViewRecords";

export function GalleryView() {
  const { table, view, fields, canEdit, openRecord } = useBase();
  const { rows, vis, getter, loading } = useViewRecords();
  const coverField = fields.find((f) => f.id === view.config.coverFieldId && f.type === "attachment");
  const ids = rows.map((r) => r.id);
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#f7f8fa] p-4">
      {loading && <p className="text-gray-400">Loading…</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {rows.map((r) => (
          <RecordCard key={r.id} record={r} fields={vis} getter={getter} coverField={coverField} onOpen={() => openRecord(table.id, r.id, ids)} />
        ))}
        {canEdit && (
          <button
            className="flex min-h-[120px] items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600"
            onClick={async () => {
              const [rec] = await createRecords(table.id, fields, [{ fields: {} }]);
              if (rec) openRecord(table.id, rec.id);
            }}
          >
            <Plus size={16} /> Add record
          </button>
        )}
      </div>
    </div>
  );
}
