"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Plus, Upload } from "lucide-react";
import { api } from "@/client/api";
import { BASE_COLORS } from "@/lib/colors";
import { COLORS } from "@/lib/fields";
import { hasRole, type Role } from "@/lib/types";
import { Menu, Modal, Popover, Toaster, toastError, useConfirm } from "./ui";

interface BaseItem {
  id: string;
  name: string;
  color: string;
  role: string;
}

export function BaseList({ initial, userName }: { initial: BaseItem[]; userName: string }) {
  const router = useRouter();
  const [bases, setBases] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BaseItem | null>(null);
  const [menu, setMenu] = useState<{ base: BaseItem; anchor: HTMLElement } | null>(null);
  const { confirm, dialog } = useConfirm();

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Welcome, {userName.split(" ")[0]}</h1>
          <p className="text-gray-500">Your bases</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> Create a base
        </button>
      </div>
      {bases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="mb-3 text-gray-600">You don&apos;t have any bases yet.</p>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> Create your first base
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bases.map((b) => (
            <div key={b.id} className="group relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
              <Link href={`/base/${b.id}`} className="flex items-center gap-3">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white"
                  style={{ background: BASE_COLORS[b.color] ?? BASE_COLORS.blue }}
                >
                  {b.name.slice(0, 2)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{b.name}</span>
                  <span className="text-xs capitalize text-gray-500">{b.role}</span>
                </span>
              </Link>
              <button
                className="absolute right-2 top-2 rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 group-hover:opacity-100"
                onClick={(e) => setMenu({ base: b, anchor: e.currentTarget })}
                aria-label="Base options"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {menu && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)}>
          <Menu
            onClose={() => setMenu(null)}
            items={[
              {
                label: "Rename / color",
                disabled: !hasRole(menu.base.role as Role, "creator"),
                onClick: () => setEditing(menu.base),
              },
              { divider: true, label: "" },
              {
                label: "Delete base",
                danger: true,
                disabled: menu.base.role !== "owner",
                onClick: async () => {
                  const b = menu.base;
                  if (!(await confirm(`Delete "${b.name}" and all of its data? This can't be undone.`))) return;
                  try {
                    await api(`/api/bases/${b.id}`, { method: "DELETE" });
                    setBases((list) => list.filter((x) => x.id !== b.id));
                  } catch (e) {
                    toastError(e);
                  }
                },
              },
            ]}
          />
        </Popover>
      )}
      {(creating || editing) && (
        <BaseForm
          base={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved, tableId) => {
            if (editing) {
              setBases((list) => list.map((b) => (b.id === saved.id ? { ...b, ...saved } : b)));
              setEditing(null);
            } else {
              router.push(`/base/${saved.id}${tableId ? `/${tableId}` : ""}`);
            }
          }}
        />
      )}
      {dialog}
      <Toaster />
    </>
  );
}

function BaseForm({
  base,
  onClose,
  onSaved,
}: {
  base: BaseItem | null;
  onClose: () => void;
  onSaved: (b: BaseItem, tableId?: string) => void;
}) {
  const [name, setName] = useState(base?.name ?? "Untitled Base");
  const [color, setColor] = useState(base?.color ?? "blue");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={base ? "Edit base" : "Create a base"} onClose={onClose} width={440}>
      <form
        className="space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (base) {
              await api(`/api/bases/${base.id}`, { method: "PATCH", body: { name, color } });
              onSaved({ ...base, name, color });
            } else {
              const res = await api<{ id: string; tableId: string }>("/api/bases", { body: { name, color } });
              onSaved({ id: res.id, name, color, role: "owner" }, res.tableId);
            }
          } catch (err) {
            toastError(err);
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Name</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-600">Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-md ring-offset-2"
                style={{ background: BASE_COLORS[c], boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${BASE_COLORS[c]}` : undefined }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        {!base && (
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <Upload size={12} /> Tip: you can import CSV files as new tables from inside the base.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !name.trim()}>
            {base ? "Save" : "Create base"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
