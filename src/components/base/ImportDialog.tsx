"use client";

import Papa from "papaparse";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { api } from "@/client/api";
import { createRecords } from "@/client/mutations";
import { guessFieldType } from "@/lib/csv";
import { FIELD_TYPES, isComputed } from "@/lib/fields";
import type { FieldType } from "@/lib/types";
import { Modal, Spinner, toast, toastError } from "../ui";
import { useBase } from "./context";

interface Parsed {
  name: string;
  headers: string[];
  rows: string[][];
}

const IMPORTABLE = FIELD_TYPES.filter((t) => !t.computed && t.type !== "link" && t.type !== "user");

export function ImportDialog({ onClose, mode }: { onClose: () => void; mode: "newTable" | "existing" }) {
  const { base, table, fields, reloadBase, selectTable } = useBase();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [types, setTypes] = useState<FieldType[]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tableName, setTableName] = useState("");

  const onFile = (file: File) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const [headerRow = [], ...rows] = res.data;
        const headers = headerRow.map((h, i) => (h ?? "").trim() || `Field ${i + 1}`);
        setParsed({ name: file.name.replace(/\.[^.]+$/, ""), headers, rows });
        setTableName(file.name.replace(/\.[^.]+$/, ""));
        setTypes(headers.map((_, i) => (i === 0 ? "text" : guessFieldType(rows.slice(0, 500).map((r) => r[i] ?? "")))));
        setMapping(
          headers.map(
            (h) => fields.find((f) => !isComputed(f.type) && f.name.toLowerCase() === h.toLowerCase())?.id ?? "",
          ),
        );
      },
      error: (err) => toastError(err),
    });
  };

  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      if (mode === "newTable") {
        const res = await api<{ table: { id: string } }>(`/api/bases/${base.id}/tables`, {
          body: {
            name: tableName || parsed.name,
            fields: parsed.headers.map((name, i) => ({ name, type: types[i] })),
            rows: parsed.rows,
          },
        });
        await reloadBase();
        selectTable(res.table.id);
      } else {
        const items = parsed.rows.map((row) => ({
          fields: Object.fromEntries(
            mapping.map((fid, i) => [fid, row[i] ?? null] as const).filter(([fid]) => fid),
          ),
        }));
        await createRecords(table.id, fields, items, { typecast: true });
        await reloadBase();
      }
      toast(`Imported ${parsed.rows.length} records`);
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  return (
    <Modal title={mode === "newTable" ? "Import CSV as a new table" : `Import CSV into "${table.name}"`} onClose={onClose} width={640}>
      <div className="space-y-4 p-5">
        {!parsed ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-10 text-gray-500 hover:border-blue-400 hover:bg-blue-50/40">
            <FileUp size={28} />
            <span>Choose a .csv file</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        ) : (
          <>
            <p className="text-gray-600">
              {parsed.rows.length} rows, {parsed.headers.length} columns.
            </p>
            {mode === "newTable" && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Table name</span>
                <input className="input" value={tableName} onChange={(e) => setTableName(e.target.value)} />
              </label>
            )}
            <div className="max-h-[45vh] overflow-y-auto rounded-md border border-gray-200">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Column</th>
                    <th className="px-3 py-2 font-medium">Sample</th>
                    <th className="px-3 py-2 font-medium">{mode === "newTable" ? "Field type" : "Import into field"}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.headers.map((h, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-medium">{h}</td>
                      <td className="max-w-[180px] truncate px-3 py-1.5 text-gray-500">{parsed.rows[0]?.[i]}</td>
                      <td className="px-3 py-1.5">
                        {mode === "newTable" ? (
                          <select
                            className="input py-1"
                            value={types[i]}
                            disabled={i === 0}
                            onChange={(e) => setTypes((t) => t.map((x, j) => (j === i ? (e.target.value as FieldType) : x)))}
                          >
                            {IMPORTABLE.filter((t) => i !== 0 || ["text", "number", "date", "email"].includes(t.type)).map((t) => (
                              <option key={t.type} value={t.type}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            className="input py-1"
                            value={mapping[i]}
                            onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? e.target.value : x)))}
                          >
                            <option value="">— Skip —</option>
                            {fields
                              .filter((f) => !isComputed(f.type))
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!parsed || busy || (mode === "existing" && !mapping.some(Boolean))} onClick={run}>
            {busy && <Spinner className="h-3 w-3 border-white/40 border-t-white" />} Import
          </button>
        </div>
      </div>
    </Modal>
  );
}
