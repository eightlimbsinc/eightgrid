"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Check, ExternalLink, FileText, Plus, Star, X } from "lucide-react";
import { api } from "@/client/api";
import { recordsStore, useTables } from "@/client/store";
import { createRecords } from "@/client/mutations";
import { chip } from "@/lib/colors";
import { COLORS, cellToText, formatDate, formatNumber, type Attachment } from "@/lib/fields";
import type { Choice, Field } from "@/lib/types";
import { Avatar, toastError } from "../ui";
import { useBase } from "./context";

// ------------------------------------------------------------------ display

export function ChoiceChip({ choice, onRemove }: { choice: Choice; onRemove?: () => void }) {
  const c = chip(choice.color);
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center gap-1 truncate rounded-full px-2 py-px text-[12px] leading-[18px]"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="truncate">{choice.name}</span>
      {onRemove && (
        <button
          type="button"
          className="opacity-60 hover:opacity-100"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function LinkPill({ name, onClick, onRemove }: { name: string; onClick?: () => void; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full shrink-0 items-center gap-1 truncate rounded bg-blue-50 px-1.5 py-px text-[12px] leading-[18px] text-blue-900 ring-1 ring-blue-200">
      <button type="button" className="truncate" onClick={onClick} disabled={!onClick}>
        {name}
      </button>
      {onRemove && (
        <button
          type="button"
          className="opacity-60 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

function Stars({ value, max, onChange }: { value: number; max: number; onChange?: (v: number | null) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <button
          type="button"
          key={i}
          disabled={!onChange}
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(value === i + 1 ? null : i + 1);
          }}
          className={clsx(!onChange && "cursor-default")}
        >
          <Star size={14} className={i < value ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
        </button>
      ))}
    </span>
  );
}

function isImage(a: Attachment) {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(a.url) || a.url.startsWith("data:image/");
}

export function AttachmentThumb({ a, size = 22 }: { a: Attachment; size?: number }) {
  return isImage(a) ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={a.url} alt={a.name} title={a.name} className="shrink-0 rounded border border-gray-200 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      title={a.name}
      className="flex shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-500"
      style={{ width: size, height: size }}
    >
      <FileText size={size * 0.6} />
    </span>
  );
}

/**
 * Read-only rendering of a cell value. `wrap` allows multiple lines (cards, record view).
 */
export function CellDisplay({
  field,
  value,
  wrap,
  onToggle,
  onRate,
}: {
  field: Field;
  value: unknown;
  wrap?: boolean;
  onToggle?: () => void;
  onRate?: (v: number | null) => void;
}) {
  const { resolver, openRecord } = useBase();
  if (value instanceof Error) return <span className="text-red-500">#ERROR</span>;
  const flex = clsx("flex min-w-0 items-center gap-1", wrap ? "flex-wrap" : "overflow-hidden");
  switch (field.type) {
    case "checkbox":
      return (
        <button
          type="button"
          disabled={!onToggle}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          className={clsx(
            "flex h-4 w-4 items-center justify-center rounded border",
            value ? "border-green-600 bg-green-600 text-white" : "border-gray-300 bg-white",
            !onToggle && "cursor-default",
          )}
          aria-label={value ? "Checked" : "Unchecked"}
        >
          {!!value && <Check size={12} strokeWidth={3} />}
        </button>
      );
    case "rating":
      return <Stars value={typeof value === "number" ? value : 0} max={field.options.max ?? 5} onChange={onRate} />;
    case "singleSelect": {
      const c = (field.options.choices ?? []).find((x) => x.id === value);
      return c ? <ChoiceChip choice={c} /> : null;
    }
    case "multiSelect": {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      const choices = field.options.choices ?? [];
      return (
        <span className={flex}>
          {ids.map((id) => {
            const c = choices.find((x) => x.id === id);
            return c ? <ChoiceChip key={id} choice={c} /> : null;
          })}
        </span>
      );
    }
    case "link": {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      const tid = field.options.linkedTableId ?? "";
      return (
        <span className={flex}>
          {ids.map((id) => (
            <LinkPill key={id} name={resolver.linkName(tid, id)} onClick={wrap ? () => openRecord(tid, id) : undefined} />
          ))}
        </span>
      );
    }
    case "attachment": {
      const list = Array.isArray(value) ? (value as Attachment[]) : [];
      return (
        <span className={flex}>
          {list.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              <AttachmentThumb a={a} size={wrap ? 64 : 22} />
            </a>
          ))}
        </span>
      );
    }
    case "user":
    case "createdBy":
    case "lastModifiedBy": {
      if (typeof value !== "string") return null;
      const name = resolver.userName(value) ?? "Unknown user";
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar name={name} size={18} />
          <span className="truncate">{name}</span>
        </span>
      );
    }
    case "url":
      return typeof value === "string" ? (
        <a
          href={/^https?:\/\//i.test(value) ? value : `https://${value}`}
          target="_blank"
          rel="noreferrer"
          className="truncate text-blue-700 underline decoration-blue-200 hover:decoration-blue-700"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      ) : null;
    case "email":
      return typeof value === "string" ? (
        <a href={`mailto:${value}`} className="truncate text-blue-700 underline decoration-blue-200" onClick={(e) => e.stopPropagation()}>
          {value}
        </a>
      ) : null;
    case "number":
    case "currency":
    case "percent":
      return typeof value === "number" ? (
        <span className={clsx("block w-full truncate tabular-nums", !wrap && "text-right")}>{formatNumber(value, field)}</span>
      ) : null;
    case "date":
      return typeof value === "string" ? <span className="truncate">{formatDate(value, !!field.options.includeTime)}</span> : null;
    case "formula":
      if (typeof value === "number")
        return <span className={clsx("block w-full truncate tabular-nums", !wrap && "text-right")}>{formatNumber(value, field)}</span>;
      if (typeof value === "boolean") return value ? <Check size={14} className="text-green-600" /> : null;
      return <span className={wrap ? "whitespace-pre-wrap break-words" : "truncate"}>{cellToText(field, value, resolver.getter(field.tableId).ctx)}</span>;
    case "longText":
      return <span className={wrap ? "whitespace-pre-wrap break-words" : "truncate"}>{String(value ?? "")}</span>;
    default:
      return <span className={wrap ? "break-words" : "truncate"}>{cellToText(field, value, resolver.getter(field.tableId).ctx)}</span>;
  }
}

// ------------------------------------------------------------------ pickers

export function SelectPicker({
  field,
  value,
  onChange,
  onDone,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  onDone?: () => void;
}) {
  const { canSchema, reloadBase } = useBase();
  const [q, setQ] = useState("");
  const multi = field.type === "multiSelect";
  const selected: string[] = multi ? ((value as string[]) ?? []) : value ? [value as string] : [];
  const choices = field.options.choices ?? [];
  const shown = choices.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const exact = choices.some((c) => c.name.toLowerCase() === q.trim().toLowerCase());

  const toggle = (id: string) => {
    if (multi) {
      onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    } else {
      onChange(selected[0] === id ? null : id);
      onDone?.();
    }
  };

  const addChoice = async () => {
    const name = q.trim();
    if (!name) return;
    const newChoice = { name, color: COLORS[choices.length % COLORS.length] };
    try {
      const res = await api<{ field: Field }>(`/api/fields/${field.id}`, {
        method: "PATCH",
        body: { options: { choices: [...choices, newChoice] } },
      });
      await reloadBase();
      const created = res.field.options.choices?.find((c) => c.name === name);
      if (created) toggle(created.id);
      setQ("");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="w-64 p-2">
      {multi && selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selected.map((id) => {
            const c = choices.find((x) => x.id === id);
            return c ? <ChoiceChip key={id} choice={c} onRemove={() => toggle(id)} /> : null;
          })}
        </div>
      )}
      <input
        autoFocus
        className="input mb-1"
        placeholder={canSchema ? "Find or create an option" : "Find an option"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (shown.length === 1) toggle(shown[0].id);
            else if (!exact && canSchema) addChoice();
          }
        }}
      />
      <div className="max-h-64 overflow-y-auto">
        {shown.map((c) => (
          <button key={c.id} type="button" className="menu-item" onClick={() => toggle(c.id)}>
            <span className="w-4">{selected.includes(c.id) && <Check size={13} />}</span>
            <ChoiceChip choice={c} />
          </button>
        ))}
        {!shown.length && !q && <p className="px-2 py-2 text-gray-400">No options yet</p>}
        {q.trim() && !exact && canSchema && (
          <button type="button" className="menu-item text-blue-700" onClick={addChoice}>
            <Plus size={13} /> Add option “{q.trim()}”
          </button>
        )}
      </div>
    </div>
  );
}

export function LinkPicker({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const { resolver, base, canEdit } = useBase();
  const tid = field.options.linkedTableId ?? "";
  const { records, loading } = useTables([tid]);
  const [q, setQ] = useState("");
  const selected = (value as string[] | null) ?? [];
  const linkedTable = base.tables.find((t) => t.id === tid);
  const list = useMemo(() => {
    const all = records.get(tid) ?? [];
    const term = q.toLowerCase();
    return all
      .map((r) => ({ id: r.id, name: resolver.primaryText(tid, r) || "Unnamed record" }))
      .filter((r) => r.name.toLowerCase().includes(term))
      .slice(0, 200);
  }, [records, tid, q, resolver]);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="w-80 p-2">
      <input autoFocus className="input mb-1" placeholder={`Find a record in ${linkedTable?.name ?? "table"}`} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-72 overflow-y-auto">
        {loading && <p className="px-2 py-2 text-gray-400">Loading…</p>}
        {list.map((r) => (
          <button key={r.id} type="button" className="menu-item" onClick={() => toggle(r.id)}>
            <span className="w-4">{selected.includes(r.id) && <Check size={13} />}</span>
            <span className="truncate">{r.name}</span>
          </button>
        ))}
        {!loading && !list.length && <p className="px-2 py-2 text-gray-400">No matching records</p>}
      </div>
      {canEdit && linkedTable && (
        <button
          type="button"
          className="menu-item mt-1 border-t border-gray-100 text-blue-700"
          onClick={async () => {
            const fields = base.fields.filter((f) => f.tableId === tid);
            const [rec] = await createRecords(tid, fields, [{ fields: q.trim() ? { [linkedTable.primaryFieldId]: q.trim() } : {} }]);
            if (rec) {
              await recordsStore.load(tid, true);
              onChange([...selected, rec.id]);
              setQ("");
            }
          }}
        >
          <Plus size={13} /> Create new record{q.trim() ? ` “${q.trim()}”` : ""}
        </button>
      )}
    </div>
  );
}

export function UserPicker({ value, onChange, onDone }: { value: unknown; onChange: (v: unknown) => void; onDone?: () => void }) {
  const { base } = useBase();
  const [q, setQ] = useState("");
  const shown = base.members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="w-64 p-2">
      <input autoFocus className="input mb-1" placeholder="Find a collaborator" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-64 overflow-y-auto">
        {shown.map((m) => (
          <button
            key={m.userId}
            type="button"
            className="menu-item"
            onClick={() => {
              onChange(value === m.userId ? null : m.userId);
              onDone?.();
            }}
          >
            <span className="w-4">{value === m.userId && <Check size={13} />}</span>
            <Avatar name={m.name} image={m.image} size={20} />
            <span className="truncate">{m.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AttachmentEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const list = (value as Attachment[] | null) ?? [];
  const [url, setUrl] = useState("");
  const add = () => {
    const u = url.trim();
    if (!u) return;
    onChange([...list, { url: u, name: u.split("/").pop()?.split("?")[0] || u }]);
    setUrl("");
  };
  return (
    <div className="w-80 space-y-2 p-2">
      {list.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <AttachmentThumb a={a} size={32} />
          <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-blue-700 hover:underline">
            {a.name}
          </a>
          <a href={a.url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-700">
            <ExternalLink size={13} />
          </a>
          <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => onChange(list.filter((_, j) => j !== i))}>
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <input
          autoFocus
          className="input"
          placeholder="Paste a file or image URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-secondary shrink-0" onClick={add}>
          Add
        </button>
      </div>
      <p className="text-xs text-gray-400">Tip: link files from Google Drive, Dropbox, or any public URL.</p>
    </div>
  );
}

// ------------------------------------------------------------------ full editor (record view)

export function toInputDate(value: unknown, includeTime: boolean): string {
  if (typeof value !== "string" || !value) return "";
  if (!includeTime) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromInputDate(v: string, includeTime: boolean): string | null {
  if (!v) return null;
  return includeTime ? new Date(v).toISOString() : v;
}

/** Inline editor for a field value, used in the expanded record and forms. */
export function FieldValueEditor({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  if (readOnly) {
    return (
      <div className="min-h-[32px] rounded-md bg-gray-50 px-2.5 py-1.5">
        <CellDisplay field={field} value={value} wrap />
      </div>
    );
  }

  const textValue = draft ?? (value === null || value === undefined ? "" : String(value));
  const commitText = () => {
    if (draft === null) return;
    onChange(draft);
    setDraft(null);
  };

  switch (field.type) {
    case "text":
    case "email":
    case "url":
    case "phone":
      return (
        <input
          className="input"
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text"}
          value={textValue}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => e.key === "Enter" && commitText()}
        />
      );
    case "longText":
      return (
        <textarea
          className="input min-h-[90px] resize-y"
          value={textValue}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
        />
      );
    case "number":
    case "currency":
    case "percent":
      return (
        <div className="relative">
          {field.type === "currency" && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">{field.options.symbol ?? "$"}</span>
          )}
          <input
            className={clsx("input", field.type === "currency" && "pl-6")}
            inputMode="decimal"
            value={textValue}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => e.key === "Enter" && commitText()}
          />
          {field.type === "percent" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">%</span>}
        </div>
      );
    case "checkbox":
      return <CellDisplay field={field} value={value} onToggle={() => onChange(!value)} />;
    case "rating":
      return <CellDisplay field={field} value={value} onRate={onChange} />;
    case "date": {
      const inc = !!field.options.includeTime;
      return (
        <input
          className="input w-auto"
          type={inc ? "datetime-local" : "date"}
          value={toInputDate(value, inc)}
          onChange={(e) => onChange(fromInputDate(e.target.value, inc))}
        />
      );
    }
    case "singleSelect":
    case "multiSelect":
    case "link":
    case "user":
    case "attachment":
      return (
        <div className="relative">
          <button
            type="button"
            className="flex min-h-[32px] w-full flex-wrap items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-left hover:border-gray-400"
            onClick={() => setPicker(!picker)}
          >
            <CellDisplay field={field} value={value} wrap />
            <Plus size={14} className="ml-auto shrink-0 text-gray-400" />
          </button>
          {picker && (
            <InlinePicker onClose={() => setPicker(false)}>
              {field.type === "singleSelect" || field.type === "multiSelect" ? (
                <SelectPicker field={field} value={value} onChange={onChange} onDone={() => setPicker(false)} />
              ) : field.type === "link" ? (
                <LinkPicker field={field} value={value} onChange={onChange} />
              ) : field.type === "user" ? (
                <UserPicker value={value} onChange={onChange} onDone={() => setPicker(false)} />
              ) : (
                <AttachmentEditor value={value} onChange={onChange} />
              )}
            </InlinePicker>
          )}
        </div>
      );
    default:
      return (
        <div className="min-h-[32px] rounded-md bg-gray-50 px-2.5 py-1.5 text-gray-600">
          <CellDisplay field={field} value={value} wrap />
        </div>
      );
  }
}

function InlinePicker({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-xl">{children}</div>
    </>
  );
}
