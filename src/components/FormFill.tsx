"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Star, X } from "lucide-react";
import { api, ApiError } from "@/client/api";
import { chip } from "@/lib/colors";
import type { Field } from "@/lib/types";
import { Logo } from "./Logo";
import { Spinner } from "./ui";

interface FormData {
  title: string;
  description: string;
  submitMessage: string;
  required: string[];
  fields: Field[];
  linkOptions: Record<string, { id: string; name: string }[]>;
}

function Input({ field, value, onChange, links }: { field: Field; value: unknown; onChange: (v: unknown) => void; links?: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  switch (field.type) {
    case "longText":
      return <textarea className="input min-h-[100px]" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
    case "currency":
    case "percent":
      return <input className="input" inputMode="decimal" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "checkbox":
      return (
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> Yes
        </label>
      );
    case "date":
      return (
        <input
          className="input w-auto"
          type={field.options.includeTime ? "datetime-local" : "date"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "rating": {
      const n = (value as number) ?? 0;
      return (
        <div className="flex gap-1">
          {Array.from({ length: field.options.max ?? 5 }, (_, i) => (
            <button type="button" key={i} onClick={() => onChange(n === i + 1 ? null : i + 1)}>
              <Star size={22} className={i < n ? "fill-amber-400 text-amber-400" : "text-gray-300"} />
            </button>
          ))}
        </div>
      );
    }
    case "singleSelect":
    case "multiSelect": {
      const multi = field.type === "multiSelect";
      const sel: string[] = multi ? ((value as string[]) ?? []) : value ? [value as string] : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options.choices ?? []).map((c) => {
            const on = sel.includes(c.id);
            const col = chip(c.color);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => onChange(multi ? (on ? sel.filter((x) => x !== c.id) : [...sel, c.id]) : on ? null : c.id)}
                className="rounded-full px-3 py-1 text-[13px] ring-2 transition"
                style={{ background: col.bg, color: col.fg, boxShadow: on ? `0 0 0 2px ${col.fg}` : "none", opacity: on || !sel.length ? 1 : 0.6 }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      );
    }
    case "link": {
      const sel = (value as string[]) ?? [];
      const shown = (links ?? []).filter((l) => l.name.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
      return (
        <div className="rounded-md border border-gray-300">
          <div className="flex flex-wrap gap-1 p-2">
            {sel.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-blue-900 ring-1 ring-blue-200">
                {links?.find((l) => l.id === id)?.name}
                <button type="button" onClick={() => onChange(sel.filter((x) => x !== id))}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <input className="min-w-[160px] flex-1 px-1 py-0.5 outline-none" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {q && (
            <div className="max-h-48 overflow-y-auto border-t border-gray-100">
              {shown.map((l) => (
                <button
                  type="button"
                  key={l.id}
                  className="menu-item"
                  onClick={() => {
                    if (!sel.includes(l.id)) onChange([...sel, l.id]);
                    setQ("");
                  }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "attachment": {
      const list = (value as { url: string; name: string }[]) ?? [];
      return (
        <div className="space-y-1">
          {list.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-blue-700">
              <span className="truncate">{a.name}</span>
              <button type="button" className="text-gray-400" onClick={() => onChange(list.filter((_, j) => j !== i))}>
                <X size={13} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input" placeholder="Paste a file URL" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (url.trim()) onChange([...list, { url: url.trim(), name: url.trim().split("/").pop() || url.trim() }]);
                setUrl("");
              }}
            >
              Add
            </button>
          </div>
        </div>
      );
    }
    default:
      return (
        <input
          className="input"
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function FormFill({ viewId }: { viewId: string }) {
  const [form, setForm] = useState<FormData | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    api<FormData>(`/api/forms/${viewId}`)
      .then((f) => {
        setForm(f);
        document.title = f.title;
      })
      .catch((e: ApiError) => setError({ status: e.status, message: e.message }));
  }, [viewId]);

  return (
    <div className="min-h-full bg-[#f7f8fa] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {error ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="mb-3">{error.message}</p>
            {error.status === 401 && (
              <Link className="btn-primary" href={`/login?next=/form/${viewId}`}>
                Sign in
              </Link>
            )}
          </div>
        ) : !form ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : done ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
            <CheckCircle2 size={44} className="mx-auto mb-3 text-green-500" />
            <p className="mb-5 text-lg">{form.submitMessage}</p>
            <button
              className="btn-secondary"
              onClick={() => {
                setValues({});
                setDone(false);
              }}
            >
              Submit another response
            </button>
          </div>
        ) : (
          <form
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setSubmitError(null);
              try {
                await api(`/api/forms/${viewId}`, { body: { fields: values } });
                setDone(true);
              } catch (err) {
                setSubmitError((err as Error).message);
              }
              setBusy(false);
            }}
          >
            <div className="h-2 bg-[#2d7ff9]" />
            <div className="p-8">
              <h1 className="mb-2 text-2xl font-semibold">{form.title}</h1>
              {form.description && <p className="mb-6 whitespace-pre-wrap text-gray-600">{form.description}</p>}
              <div className="space-y-6">
                {form.fields.map((f) => (
                  <div key={f.id}>
                    <label className="mb-1.5 block font-medium">
                      {f.name}
                      {form.required.includes(f.id) && <span className="text-red-500"> *</span>}
                    </label>
                    {f.description && <p className="mb-1.5 text-xs text-gray-500">{f.description}</p>}
                    <Input field={f} value={values[f.id]} links={form.linkOptions[f.id]} onChange={(v) => setValues((m) => ({ ...m, [f.id]: v }))} />
                  </div>
                ))}
              </div>
              {submitError && <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-red-700">{submitError}</p>}
              <button className="btn-primary mt-8 px-6 py-2" disabled={busy}>
                {busy ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        )}
        <div className="mt-6 flex justify-center opacity-60">
          <Logo withText size={20} />
        </div>
      </div>
    </div>
  );
}
