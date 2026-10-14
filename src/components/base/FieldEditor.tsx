"use client";

import { useMemo, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { api } from "@/client/api";
import { chip } from "@/lib/colors";
import { COLORS, defaultOptions, FIELD_TYPES } from "@/lib/fields";
import { FUNCTION_NAMES, formulaIdsToNames, formulaNamesToIds, validateFormula } from "@/lib/formula";
import type { Choice, Field, FieldOptions, FieldType } from "@/lib/types";
import { toastError } from "../ui";
import { useBase } from "./context";
import { FieldIcon } from "./FieldIcon";

const PRIMARY_TYPES: FieldType[] = ["text", "longText", "number", "currency", "percent", "date", "email", "url", "phone", "formula", "singleSelect", "createdTime", "rating"];

export function FieldEditor({
  field,
  onClose,
  onSaved,
}: {
  field?: Field;
  onClose: () => void;
  onSaved?: (f: Field) => void;
}) {
  const { base, table, fields, reloadBase } = useBase();
  const isPrimary = field?.id === table.primaryFieldId;
  const [name, setName] = useState(field?.name ?? "");
  const [type, setType] = useState<FieldType>(field?.type ?? "text");
  const [description, setDescription] = useState(field?.description ?? "");
  const [options, setOptions] = useState<FieldOptions>(() => {
    const o = field ? { ...field.options } : defaultOptions("text");
    if (o.formula) o.formula = formulaIdsToNames(o.formula, fields);
    return o;
  });
  const [busy, setBusy] = useState(false);

  const otherFields = fields.filter((f) => f.id !== field?.id);
  const formulaError = useMemo(() => (type === "formula" ? validateFormula(options.formula ?? "") : null), [type, options.formula]);
  const unknownRefs = useMemo(() => {
    if (type !== "formula") return [];
    const refs = [...(options.formula ?? "").matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
    return refs.filter((r) => !otherFields.some((f) => f.name.toLowerCase() === r.toLowerCase()));
  }, [type, options.formula, otherFields]);

  const changeType = (t: FieldType) => {
    setType(t);
    const keepChoices = (t === "singleSelect" || t === "multiSelect") && options.choices?.length;
    setOptions({ ...defaultOptions(t), ...(keepChoices ? { choices: options.choices } : {}) });
  };

  const save = async () => {
    if (type === "link" && !options.linkedTableId) return toastError("Choose a table to link to");
    if (type === "formula" && (formulaError || unknownRefs.length)) return;
    setBusy(true);
    const body = {
      name: name.trim() || FIELD_TYPES.find((t) => t.type === type)!.label,
      type,
      description,
      options: {
        ...options,
        ...(type === "formula" ? { formula: formulaNamesToIds(options.formula ?? "", otherFields) } : {}),
        inverseFieldId: undefined,
      },
    };
    try {
      const res = field
        ? await api<{ field: Field }>(`/api/fields/${field.id}`, { method: "PATCH", body })
        : await api<{ field: Field }>(`/api/tables/${table.id}/fields`, { body });
      await reloadBase();
      onSaved?.(res.field);
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  const typeChoices = FIELD_TYPES.filter((t) => !isPrimary || PRIMARY_TYPES.includes(t.type));

  return (
    <form
      className="w-[360px] space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input autoFocus className="input" placeholder="Field name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          <FieldIcon type={type} />
        </span>
        <select className="input pl-8" value={type} onChange={(e) => changeType(e.target.value as FieldType)}>
          {typeChoices.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {field && type !== field.type && (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Changing the type will convert existing values. Some data may be lost.
        </p>
      )}

      {(type === "number" || type === "currency" || type === "percent" || type === "formula") && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-600">Decimal places</span>
          <select
            className="input w-24"
            value={options.precision ?? (type === "formula" ? "" : 0)}
            onChange={(e) => setOptions({ ...options, precision: e.target.value === "" ? undefined : Number(e.target.value) })}
          >
            {type === "formula" && <option value="">Auto</option>}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "1" : `1.${"0".repeat(n)}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {type === "currency" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-600">Currency symbol</span>
          <input className="input w-24" value={options.symbol ?? "$"} onChange={(e) => setOptions({ ...options, symbol: e.target.value })} />
        </label>
      )}
      {type === "date" && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!options.includeTime} onChange={(e) => setOptions({ ...options, includeTime: e.target.checked })} />
          <span>Include time</span>
        </label>
      )}
      {type === "rating" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-600">Maximum</span>
          <select className="input w-24" value={options.max ?? 5} onChange={(e) => setOptions({ ...options, max: Number(e.target.value) })}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      {type === "link" && (
        <label className="block">
          <span className="mb-1 block text-gray-600">Link to table</span>
          <select
            className="input"
            value={options.linkedTableId ?? ""}
            onChange={(e) => setOptions({ ...options, linkedTableId: e.target.value || undefined })}
          >
            <option value="">Choose a table…</option>
            {base.tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.id === table.id ? " (this table)" : ""}
              </option>
            ))}
          </select>
          {options.linkedTableId && options.linkedTableId !== table.id && !field?.options.inverseFieldId && (
            <span className="mt-1 block text-xs text-gray-500">A matching link field will be added to the other table.</span>
          )}
        </label>
      )}
      {(type === "singleSelect" || type === "multiSelect") && (
        <ChoicesEditor choices={options.choices ?? []} onChange={(choices) => setOptions({ ...options, choices })} />
      )}
      {type === "formula" && (
        <div>
          <textarea
            className="input min-h-[80px] font-mono text-[12px]"
            placeholder={`e.g. IF({${otherFields[0]?.name ?? "Price"}} > 100, "Big", "Small")`}
            value={options.formula ?? ""}
            onChange={(e) => setOptions({ ...options, formula: e.target.value })}
            spellCheck={false}
          />
          {formulaError ? (
            <p className="mt-1 text-xs text-red-600">{formulaError}</p>
          ) : unknownRefs.length ? (
            <p className="mt-1 text-xs text-red-600">Unknown field: {`{${unknownRefs[0]}}`}</p>
          ) : null}
          <details className="mt-1 text-xs text-gray-500">
            <summary className="cursor-pointer">Fields & functions</summary>
            <div className="mt-1 flex flex-wrap gap-1">
              {otherFields.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  className="rounded bg-gray-100 px-1.5 py-0.5 hover:bg-gray-200"
                  onClick={() => setOptions({ ...options, formula: `${options.formula ?? ""}{${f.name}}` })}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <p className="mt-2 leading-relaxed">{FUNCTION_NAMES.join(", ")}</p>
          </details>
        </div>
      )}
      <textarea
        className="input min-h-[34px] text-[12px]"
        rows={1}
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy || !!formulaError || unknownRefs.length > 0}>
          {field ? "Save" : "Create field"}
        </button>
      </div>
    </form>
  );
}

function ChoicesEditor({ choices, onChange }: { choices: Choice[]; onChange: (c: Choice[]) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const [colorFor, setColorFor] = useState<number | null>(null);
  return (
    <div className="space-y-1">
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {choices.map((c, i) => (
          <div
            key={c.id || i}
            className="relative flex items-center gap-1.5"
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag === null || drag === i) return;
              const next = [...choices];
              const [m] = next.splice(drag, 1);
              next.splice(i, 0, m);
              onChange(next);
              setDrag(null);
            }}
          >
            <GripVertical size={13} className="cursor-grab text-gray-300" />
            <button
              type="button"
              className="h-5 w-5 shrink-0 rounded-full border border-black/10"
              style={{ background: chip(c.color).bg }}
              onClick={() => setColorFor(colorFor === i ? null : i)}
              aria-label="Color"
            />
            <input
              className="input py-1"
              value={c.name}
              onChange={(e) => onChange(choices.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => onChange(choices.filter((_, j) => j !== i))}>
              <X size={14} />
            </button>
            {colorFor === i && (
              <div className="absolute left-6 top-7 z-10 flex flex-wrap gap-1 rounded-md border border-gray-200 bg-white p-1.5 shadow-lg" style={{ width: 150 }}>
                {COLORS.map((col) => (
                  <button
                    type="button"
                    key={col}
                    className="h-5 w-5 rounded-full border border-black/10"
                    style={{ background: chip(col).bg }}
                    onClick={() => {
                      onChange(choices.map((x, j) => (j === i ? { ...x, color: col } : x)));
                      setColorFor(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="menu-item text-blue-700"
        onClick={() => onChange([...choices, { id: "", name: `Option ${choices.length + 1}`, color: COLORS[choices.length % COLORS.length] }])}
      >
        <Plus size={13} /> Add option
      </button>
    </div>
  );
}
