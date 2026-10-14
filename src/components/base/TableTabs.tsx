"use client";

import clsx from "clsx";
import { useState } from "react";
import { ChevronDown, FileUp, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import { api } from "@/client/api";
import { BASE_COLORS } from "@/lib/colors";
import { Menu, Popover, toastError } from "../ui";
import { useBase } from "./context";
import { ImportDialog } from "./ImportDialog";

export function TableTabs() {
  const { base, table, canSchema, selectTable, reloadBase, confirm } = useBase();
  const [menu, setMenu] = useState<{ tableId: string; anchor: HTMLElement } | null>(null);
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [importing, setImporting] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const color = BASE_COLORS[base.color] ?? BASE_COLORS.blue;

  const rename = async (id: string) => {
    setRenaming(null);
    const t = base.tables.find((x) => x.id === id);
    if (!t || !name.trim() || name === t.name) return;
    try {
      await api(`/api/tables/${id}`, { method: "PATCH", body: { name: name.trim() } });
      await reloadBase();
    } catch (e) {
      toastError(e);
    }
  };

  const addTable = async () => {
    try {
      const res = await api<{ table: { id: string } }>(`/api/bases/${base.id}/tables`, {
        body: { name: `Table ${base.tables.length + 1}` },
      });
      await reloadBase();
      selectTable(res.table.id);
    } catch (e) {
      toastError(e);
    }
  };

  const reorder = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const order = base.tables.map((t) => t.id).filter((id) => id !== fromId);
    order.splice(order.indexOf(toId), 0, fromId);
    try {
      await api(`/api/bases/${base.id}/tables`, { method: "PATCH", body: { order } });
      await reloadBase();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto px-2" style={{ background: color }}>
      <div className="flex h-8 items-end gap-0.5 bg-black/10 px-1 pt-1 rounded-t-md">
        {base.tables.map((t) => {
          const active = t.id === table.id;
          return (
            <div
              key={t.id}
              draggable={canSchema && renaming !== t.id}
              onDragStart={() => setDragId(t.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dragId && reorder(dragId, t.id)}
              className={clsx(
                "group flex h-7 items-center gap-1 rounded-t-md px-3 text-[13px] whitespace-nowrap",
                active ? "bg-white font-medium text-gray-900" : "text-white/90 hover:bg-black/10",
              )}
            >
              {renaming === t.id ? (
                <input
                  autoFocus
                  className="w-32 rounded border border-blue-400 px-1 text-gray-900"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => rename(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(t.id);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <button
                  onClick={() => selectTable(t.id)}
                  onDoubleClick={() => {
                    if (!canSchema) return;
                    setName(t.name);
                    setRenaming(t.id);
                  }}
                >
                  {t.name}
                </button>
              )}
              {active && canSchema && renaming !== t.id && (
                <button
                  className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                  onClick={(e) => setMenu({ tableId: t.id, anchor: e.currentTarget })}
                  aria-label="Table options"
                >
                  <ChevronDown size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {canSchema && (
        <button
          className="mb-1 ml-1 flex items-center gap-1 rounded px-2 py-1 text-[13px] text-white/90 hover:bg-black/10"
          onClick={(e) => setAddMenu(e.currentTarget)}
        >
          <Plus size={14} /> Add or import
        </button>
      )}
      {addMenu && (
        <Popover anchor={addMenu} onClose={() => setAddMenu(null)}>
          <Menu
            onClose={() => setAddMenu(null)}
            items={[
              { label: "Start from scratch", icon: <Table2 size={14} />, onClick: addTable },
              { label: "Import CSV file", icon: <FileUp size={14} />, onClick: () => setImporting(true) },
            ]}
          />
        </Popover>
      )}
      {menu && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)}>
          <Menu
            onClose={() => setMenu(null)}
            items={[
              {
                label: "Rename table",
                icon: <Pencil size={14} />,
                onClick: () => {
                  setName(base.tables.find((t) => t.id === menu.tableId)?.name ?? "");
                  setRenaming(menu.tableId);
                },
              },
              { divider: true, label: "" },
              {
                label: "Delete table",
                icon: <Trash2 size={14} />,
                danger: true,
                disabled: base.tables.length <= 1,
                onClick: async () => {
                  const t = base.tables.find((x) => x.id === menu.tableId)!;
                  if (!(await confirm(`Delete table "${t.name}" and all of its records?`))) return;
                  try {
                    await api(`/api/tables/${t.id}`, { method: "DELETE" });
                    await reloadBase();
                  } catch (e) {
                    toastError(e);
                  }
                },
              },
            ]}
          />
        </Popover>
      )}
      {importing && <ImportDialog mode="newTable" onClose={() => setImporting(false)} />}
    </div>
  );
}
