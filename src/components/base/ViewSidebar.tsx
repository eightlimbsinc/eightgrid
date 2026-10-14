"use client";

import clsx from "clsx";
import { useState } from "react";
import {
  Calendar,
  ClipboardList,
  Copy,
  Grid3x3,
  LayoutGrid,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  SquareKanban,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/client/api";
import type { View, ViewType } from "@/lib/types";
import { Menu, Popover, toastError } from "../ui";
import { useBase } from "./context";

export const VIEW_META: Record<ViewType, { label: string; icon: LucideIcon; color: string }> = {
  grid: { label: "Grid", icon: Grid3x3, color: "text-blue-600" },
  kanban: { label: "Kanban", icon: SquareKanban, color: "text-green-600" },
  calendar: { label: "Calendar", icon: Calendar, color: "text-orange-600" },
  gallery: { label: "Gallery", icon: LayoutGrid, color: "text-purple-600" },
  form: { label: "Form", icon: ClipboardList, color: "text-pink-600" },
};

export function ViewIcon({ type, size = 15 }: { type: ViewType; size?: number }) {
  const m = VIEW_META[type];
  return <m.icon size={size} className={clsx("shrink-0", m.color)} />;
}

export function ViewSidebar() {
  const { base, table, view, canSchema, selectView, reloadBase, confirm } = useBase();
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<{ view: View; anchor: HTMLElement } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");

  const views = base.views.filter((v) => v.tableId === table.id);
  const shown = views.filter((v) => v.name.toLowerCase().includes(filter.toLowerCase()));

  const create = async (type: ViewType, config?: View["config"], nameOverride?: string) => {
    const label = nameOverride ?? `${VIEW_META[type].label} view`;
    const taken = new Set(views.map((v) => v.name));
    let finalName = label;
    for (let i = 2; taken.has(finalName); i++) finalName = `${label} ${i}`;
    try {
      const res = await api<{ view: View }>(`/api/tables/${table.id}/views`, { body: { name: finalName, type, config } });
      await reloadBase();
      selectView(res.view.id);
    } catch (e) {
      toastError(e);
    }
  };

  const rename = async (id: string) => {
    setRenaming(null);
    if (!name.trim()) return;
    try {
      await api(`/api/views/${id}`, { method: "PATCH", body: { name: name.trim() } });
      await reloadBase();
    } catch (e) {
      toastError(e);
    }
  };

  if (!open) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-gray-200 pt-2">
        <button className="rounded p-1.5 text-gray-500 hover:bg-gray-100" onClick={() => setOpen(true)} title="Show views">
          <PanelLeftOpen size={16} />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-1 p-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-md py-1.5 pl-7 pr-2 text-[13px] hover:bg-gray-50 focus:bg-gray-50"
            placeholder="Find a view"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <button className="rounded p-1.5 text-gray-500 hover:bg-gray-100" onClick={() => setOpen(false)} title="Hide views">
          <PanelLeftClose size={16} />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2">
        {shown.map((v) => (
          <div
            key={v.id}
            className={clsx(
              "group flex items-center gap-2 rounded-md px-2 py-1.5",
              v.id === view.id ? "bg-blue-50 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-100",
            )}
          >
            <ViewIcon type={v.type} />
            {renaming === v.id ? (
              <input
                autoFocus
                className="min-w-0 flex-1 rounded border border-blue-400 px-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => rename(v.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename(v.id);
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => selectView(v.id)}>
                {v.name}
              </button>
            )}
            {canSchema && (
              <button
                className="rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 group-hover:opacity-100"
                onClick={(e) => setMenu({ view: v, anchor: e.currentTarget })}
                aria-label="View options"
              >
                <MoreHorizontal size={14} />
              </button>
            )}
          </div>
        ))}
      </nav>
      {canSchema && (
        <div className="border-t border-gray-200 p-2">
          <div className="mb-1 px-2 text-xs font-medium text-gray-500">Create…</div>
          {(Object.keys(VIEW_META) as ViewType[]).map((t) => (
            <button key={t} className="menu-item" onClick={() => create(t)}>
              <ViewIcon type={t} />
              {VIEW_META[t].label}
              <Plus size={13} className="ml-auto text-gray-400" />
            </button>
          ))}
        </div>
      )}
      {menu && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)}>
          <Menu
            onClose={() => setMenu(null)}
            items={[
              {
                label: "Rename view",
                icon: <Pencil size={14} />,
                onClick: () => {
                  setName(menu.view.name);
                  setRenaming(menu.view.id);
                },
              },
              {
                label: "Duplicate view",
                icon: <Copy size={14} />,
                onClick: () => create(menu.view.type, menu.view.config, `${menu.view.name} copy`),
              },
              { divider: true, label: "" },
              {
                label: "Delete view",
                icon: <Trash2 size={14} />,
                danger: true,
                disabled: views.length <= 1,
                onClick: async () => {
                  if (!(await confirm(`Delete view "${menu.view.name}"? Records are not affected.`))) return;
                  try {
                    await api(`/api/views/${menu.view.id}`, { method: "DELETE" });
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
    </aside>
  );
}
