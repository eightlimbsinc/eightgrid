"use client";

import Link from "next/link";
import { useState } from "react";
import { fieldTypeLabel } from "@/lib/fields";
import { Modal } from "../ui";
import { useBase } from "./context";

export function ApiInfoDialog({ onClose }: { onClose: () => void }) {
  const { base, table: current } = useBase();
  const [tableId, setTableId] = useState(current.id);
  const table = base.tables.find((t) => t.id === tableId)!;
  const fields = base.fields.filter((f) => f.tableId === table.id);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/api/v1/bases/${base.id}/tables/${table.id}/records`;
  return (
    <Modal title="API for this base" onClose={onClose} width={720}>
      <div className="space-y-4 p-5">
        <p className="text-gray-600">
          Use a personal API token from{" "}
          <Link href="/account" className="text-blue-600 hover:underline">
            your account
          </Link>
          . Full reference in the{" "}
          <Link href="/docs/api" className="text-blue-600 hover:underline">
            API docs
          </Link>
          .
        </p>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Table</span>
          <select className="input w-auto" value={tableId} onChange={(e) => setTableId(e.target.value)}>
            {base.tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <code className="text-xs text-gray-500">{table.id}</code>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
{`# List records
curl "${url}?pageSize=50" \\
  -H "Authorization: Bearer $EIGHTGRID_TOKEN"

# Create a record (field names as keys)
curl -X POST "${url}" \\
  -H "Authorization: Bearer $EIGHTGRID_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"records":[{"fields":{"${fields[0]?.name ?? "Name"}":"Hello"}}],"typecast":true}'`}
        </pre>
        <table className="w-full text-left">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="py-1 font-medium">Field</th>
              <th className="font-medium">ID</th>
              <th className="font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} className="border-t border-gray-100">
                <td className="py-1.5">{f.name}</td>
                <td className="font-mono text-xs">{f.id}</td>
                <td className="text-gray-600">{fieldTypeLabel(f.type)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
