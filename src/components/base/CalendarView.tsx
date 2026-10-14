"use client";

import clsx from "clsx";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { createRecords, updateRecords } from "@/client/mutations";
import { toDateOnly } from "@/lib/fields";
import { useBase } from "./context";
import { useViewRecords } from "./useViewRecords";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dayKey(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : toDateOnly(d);
}

export function CalendarView() {
  const { table, view, fields, canEdit, openRecord, patchView } = useBase();
  const { rows, getter, loading } = useViewRecords();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const field = fields.find((f) => f.id === view.config.calendarFieldId);
  const primary = fields.find((f) => f.id === table.primaryFieldId);

  if (!field) {
    const options = fields.filter((f) => f.type === "date" || f.type === "createdTime" || f.type === "lastModifiedTime" || f.type === "formula");
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f8fa]">
        <div className="max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="mb-3 font-medium">Choose a date field for the calendar</p>
          {options.length ? (
            <select className="input" value="" onChange={(e) => patchView({ calendarFieldId: e.target.value })}>
              <option value="">Select a field…</option>
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-gray-500">Add a date field to this table to use a calendar view.</p>
          )}
        </div>
      </div>
    );
  }

  const editable = canEdit && field.type === "date";
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dayKey(getter.get(r, field));
    if (!k) continue;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(r);
  }
  const ids = rows.map((r) => r.id);

  const first = new Date(month);
  first.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
  const today = toDateOnly(new Date());
  const undated = rows.filter((r) => !dayKey(getter.get(r, field))).length;

  const moveTo = (recordId: string, day: string) => {
    const rec = rows.find((r) => r.id === recordId);
    if (!rec) return;
    let value: string = day;
    if (field.options.includeTime) {
      const old = rec.data[field.id];
      const base = typeof old === "string" ? new Date(old) : new Date(`${day}T09:00:00`);
      const [y, m, d] = day.split("-").map(Number);
      base.setFullYear(y, m - 1, d);
      value = base.toISOString();
    }
    updateRecords(table.id, fields, [{ id: recordId, fields: { [field.id]: value } }]);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
        <button className="rounded p-1 hover:bg-gray-100" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <button className="rounded p-1 hover:bg-gray-100" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
        <h3 className="text-[15px] font-semibold">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </h3>
        <button
          className="btn-secondary ml-2 py-0.5"
          onClick={() => {
            const d = new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }}
        >
          Today
        </button>
        <div className="flex-1" />
        {loading && <span className="text-gray-400">Loading…</span>}
        {undated > 0 && <span className="text-xs text-gray-500">{undated} records without a date</span>}
      </div>
      <div className="grid grid-cols-7 border-b border-gray-200 text-xs font-medium text-gray-500">
        {DAYS.map((d) => (
          <div key={d} className="px-2 py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {cells.map((d) => {
          const key = toDateOnly(d);
          const list = byDay.get(key) ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <div
              key={key}
              className={clsx("group flex min-h-0 flex-col border-b border-r border-gray-100 p-1", !inMonth && "bg-gray-50/70")}
              onDragOver={(e) => editable && e.preventDefault()}
              onDrop={() => {
                if (dragId) moveTo(dragId, key);
                setDragId(null);
              }}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <span
                  className={clsx(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
                    key === today ? "bg-red-500 font-semibold text-white" : inMonth ? "text-gray-700" : "text-gray-400",
                  )}
                >
                  {d.getDate()}
                </span>
                {editable && (
                  <button
                    className="rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-100 group-hover:opacity-100"
                    onClick={async () => {
                      const [rec] = await createRecords(table.id, fields, [{ fields: { [field.id]: key } }]);
                      if (rec) openRecord(table.id, rec.id);
                    }}
                    aria-label="Add record"
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                {list.map((r) => (
                  <button
                    key={r.id}
                    draggable={editable}
                    onDragStart={() => setDragId(r.id)}
                    onClick={() => openRecord(table.id, r.id, ids)}
                    className="block w-full truncate rounded bg-blue-100 px-1.5 py-0.5 text-left text-xs text-blue-900 hover:bg-blue-200"
                  >
                    {(primary && getter.text(r, primary)) || "Unnamed record"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
