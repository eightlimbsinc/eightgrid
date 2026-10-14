"use client";

import clsx from "clsx";
import { useState } from "react";
import { Copy, ExternalLink, GripVertical, Plus, X } from "lucide-react";
import { isComputed } from "@/lib/fields";
import type { FormConfig } from "@/lib/types";
import { toast } from "../ui";
import { useBase } from "./context";
import { FieldIcon } from "./FieldIcon";

export function FormBuilder() {
  const { view, table, fields, canSchema, patchView } = useBase();
  const form: FormConfig = view.config.form ?? {};
  const [drag, setDrag] = useState<string | null>(null);
  const set = (patch: Partial<FormConfig>) => patchView({ form: { ...form, ...patch } });
  const included = (form.fieldIds ?? []).map((id) => fields.find((f) => f.id === id)).filter((f) => f && !isComputed(f.type) && f.type !== "user") as typeof fields;
  const excluded = fields.filter((f) => !isComputed(f.type) && f.type !== "user" && !included.includes(f));
  const required = new Set(form.required ?? []);
  const url = typeof window !== "undefined" ? `${window.location.origin}/form/${view.id}` : "";

  return (
    <div className="absolute inset-0 flex bg-[#f7f8fa]">
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="h-2 bg-[#2d7ff9]" />
          <div className="space-y-2 p-6">
            <input
              className="w-full rounded px-1 text-2xl font-semibold outline-none hover:bg-gray-50 focus:bg-gray-50"
              value={form.title ?? table.name}
              disabled={!canSchema}
              onChange={(e) => set({ title: e.target.value })}
            />
            <textarea
              className="w-full resize-none rounded px-1 text-gray-600 outline-none hover:bg-gray-50 focus:bg-gray-50"
              placeholder="Add a description…"
              value={form.description ?? ""}
              disabled={!canSchema}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div className="space-y-2 px-6 pb-6">
            {included.map((f) => (
              <div
                key={f.id}
                draggable={canSchema}
                onDragStart={() => setDrag(f.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!drag || drag === f.id) return;
                  const ids = included.map((x) => x.id).filter((id) => id !== drag);
                  ids.splice(ids.indexOf(f.id), 0, drag);
                  set({ fieldIds: ids });
                  setDrag(null);
                }}
                className="group flex items-center gap-2 rounded-lg border border-gray-200 p-3 hover:border-gray-300"
              >
                <GripVertical size={14} className="cursor-grab text-gray-300" />
                <FieldIcon type={f.type} />
                <span className="flex-1 font-medium">
                  {f.name}
                  {required.has(f.id) && <span className="text-red-500"> *</span>}
                </span>
                {canSchema && (
                  <>
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={required.has(f.id)}
                        onChange={(e) =>
                          set({ required: e.target.checked ? [...required, f.id] : [...required].filter((id) => id !== f.id) })
                        }
                      />
                      Required
                    </label>
                    <button
                      className="rounded p-1 text-gray-400 hover:bg-gray-100"
                      onClick={() => set({ fieldIds: included.filter((x) => x.id !== f.id).map((x) => x.id) })}
                      aria-label="Remove from form"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
            {!included.length && <p className="py-6 text-center text-gray-400">Add fields to your form from the right.</p>}
          </div>
        </div>
      </div>
      <aside className="w-80 shrink-0 space-y-5 overflow-y-auto border-l border-gray-200 bg-white p-4">
        <div>
          <h3 className="mb-2 font-semibold">Share form</h3>
          <label className={clsx("mb-2 flex items-center gap-2", !canSchema && "opacity-60")}>
            <input type="checkbox" disabled={!canSchema} checked={!!form.public} onChange={(e) => set({ public: e.target.checked })} />
            Anyone with the link can submit
          </label>
          <p className="mb-2 text-xs text-gray-500">
            {form.public ? "No sign-in required." : "Only signed-in members with edit access can submit."}
          </p>
          <div className="flex gap-1">
            <input className="input text-xs" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button
              className="btn-secondary px-2"
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast("Form link copied");
              }}
              title="Copy link"
            >
              <Copy size={14} />
            </button>
            <a className="btn-secondary px-2" href={url} target="_blank" rel="noreferrer" title="Open form">
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block font-semibold">After submit message</span>
          <input
            className="input"
            disabled={!canSchema}
            placeholder="Thanks for submitting the form!"
            value={form.submitMessage ?? ""}
            onChange={(e) => set({ submitMessage: e.target.value })}
          />
        </label>
        {canSchema && (
          <div>
            <h3 className="mb-2 font-semibold">Fields</h3>
            {excluded.length ? (
              <div className="space-y-1">
                {excluded.map((f) => (
                  <button key={f.id} className="menu-item" onClick={() => set({ fieldIds: [...included.map((x) => x.id), f.id] })}>
                    <FieldIcon type={f.type} />
                    <span className="flex-1 truncate">{f.name}</span>
                    <Plus size={13} className="text-gray-400" />
                  </button>
                ))}
                <button className="mt-1 text-xs text-blue-700 hover:underline" onClick={() => set({ fieldIds: [...included, ...excluded].map((f) => f.id) })}>
                  Add all fields
                </button>
              </div>
            ) : (
              <p className="text-gray-500">All fields are on the form.</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
