"use client";

import clsx from "clsx";
import { useState } from "react";
import {
  ArrowUpDown,
  Download,
  EyeOff,
  Filter,
  GripVertical,
  Layers,
  MoreHorizontal,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { recordsStore } from "@/client/store";
import { downloadText, toCsv } from "@/lib/csv";
import { newId } from "@/lib/ids";
import { defaultOp, opsForType, orderedFields, viewRecords, visibleFields, searchRecords } from "@/lib/query";
import type { Field, FilterCondition, FilterSet, SortSpec } from "@/lib/types";
import { Menu, Popover, PopoverButton } from "../ui";
import { useBase } from "./context";
import { FieldIcon } from "./FieldIcon";
import { ImportDialog } from "./ImportDialog";
import { SelectPicker, UserPicker, ChoiceChip, toInputDate } from "./cells";
import { ViewIcon } from "./ViewSidebar";

function FieldSelect({
  fields,
  value,
  onChange,
  className,
}: {
  fields: Field[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <select className={clsx("input py-1", className)} value={value} onChange={(e) => onChange(e.target.value)}>
      {fields.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

export function Toolbar() {
  const { view, table, fields, search, setSearch, canEdit, canSchema, resolver, base } = useBase();
  const [importing, setImporting] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const cfg = view.config;
  const filterCount = cfg.filters?.conditions.length ?? 0;
  const sortCount = cfg.sorts?.length ?? 0;
  const groupCount = cfg.groups?.length ?? 0;
  const hiddenCount = (cfg.hiddenFieldIds ?? []).filter((id) => fields.some((f) => f.id === id)).length;
  const isForm = view.type === "form";

  const exportCsv = () => {
    const getter = resolver.getter(table.id);
    let rows = viewRecords(recordsStore.records(table.id), view, getter);
    const vis = visibleFields(fields, view, table.primaryFieldId);
    rows = searchRecords(rows, vis, search, getter);
    const csv = toCsv([vis.map((f) => f.name), ...rows.map((r) => vis.map((f) => getter.text(r, f)))]);
    downloadText(`${base.name} - ${table.name} - ${view.name}.csv`, csv);
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-gray-200 px-2">
      <span className="mr-2 flex items-center gap-1.5 px-1 font-medium">
        <ViewIcon type={view.type} />
        <span className="max-w-[180px] truncate">{view.name}</span>
      </span>
      {!isForm && (
        <>
          <PopoverButton
            className={clsx("toolbar-btn", hiddenCount && "bg-blue-100 text-blue-900 hover:bg-blue-100")}
            button={
              <>
                <EyeOff size={14} /> {hiddenCount ? `${hiddenCount} hidden field${hiddenCount > 1 ? "s" : ""}` : "Hide fields"}
              </>
            }
          >
            {() => <HideFields />}
          </PopoverButton>
          <PopoverButton
            className={clsx("toolbar-btn", filterCount && "bg-green-100 text-green-900 hover:bg-green-100")}
            button={
              <>
                <Filter size={14} /> {filterCount ? `Filtered by ${filterCount} field${filterCount > 1 ? "s" : ""}` : "Filter"}
              </>
            }
          >
            {() => <FilterEditor />}
          </PopoverButton>
          {view.type === "grid" && (
            <PopoverButton
              className={clsx("toolbar-btn", groupCount && "bg-purple-100 text-purple-900 hover:bg-purple-100")}
              button={
                <>
                  <Layers size={14} /> {groupCount ? `Grouped by ${groupCount} field${groupCount > 1 ? "s" : ""}` : "Group"}
                </>
              }
            >
              {() => <SortEditor kind="groups" />}
            </PopoverButton>
          )}
          <PopoverButton
            className={clsx("toolbar-btn", sortCount && "bg-orange-100 text-orange-900 hover:bg-orange-100")}
            button={
              <>
                <ArrowUpDown size={14} /> {sortCount ? `Sorted by ${sortCount} field${sortCount > 1 ? "s" : ""}` : "Sort"}
              </>
            }
          >
            {() => <SortEditor kind="sorts" />}
          </PopoverButton>
          {(view.type === "kanban" || view.type === "calendar" || view.type === "gallery") && (
            <PopoverButton
              className="toolbar-btn"
              button={
                <>
                  <Settings2 size={14} /> Customize
                </>
              }
            >
              {() => <LayoutSettings />}
            </PopoverButton>
          )}
        </>
      )}
      <div className="flex-1" />
      {!isForm &&
        (searchOpen || search ? (
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              className="w-48 rounded-md border border-gray-300 py-1 pl-7 pr-6 text-[13px] focus:border-blue-500"
              placeholder="Find in view"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => !search && setSearchOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearch("");
                  setSearchOpen(false);
                }
              }}
            />
            {search && (
              <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setSearch("")}>
                <X size={13} />
              </button>
            )}
          </div>
        ) : (
          <button className="toolbar-btn" onClick={() => setSearchOpen(true)} title="Search">
            <Search size={15} />
          </button>
        ))}
      <PopoverButton className="toolbar-btn" align="right" button={<MoreHorizontal size={16} />}>
        {(close) => (
          <Menu
            onClose={close}
            items={[
              { label: "Download CSV", icon: <Download size={14} />, onClick: exportCsv },
              { label: "Import CSV into this table", icon: <Upload size={14} />, disabled: !canEdit, onClick: () => setImporting(true) },
            ]}
          />
        )}
      </PopoverButton>
      {!canSchema && !isForm && <span className="ml-1 hidden text-xs text-gray-400 lg:inline">View changes aren&apos;t saved</span>}
      {importing && <ImportDialog mode="existing" onClose={() => setImporting(false)} />}
    </div>
  );
}

function HideFields() {
  const { view, table, fields, patchView } = useBase();
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const hidden = new Set(view.config.hiddenFieldIds ?? []);
  const ordered = orderedFields(fields, view, table.primaryFieldId).filter((f) => f.id !== table.primaryFieldId);
  const shown = ordered.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
  const setHidden = (ids: string[]) => patchView({ hiddenFieldIds: ids });
  return (
    <div className="w-72 p-2">
      <input autoFocus className="input mb-2" placeholder="Find a field" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-80 overflow-y-auto">
        {shown.map((f) => (
          <div
            key={f.id}
            draggable
            onDragStart={() => setDrag(f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!drag || drag === f.id) return;
              const ids = ordered.map((x) => x.id).filter((id) => id !== drag);
              ids.splice(ids.indexOf(f.id), 0, drag);
              patchView({ fieldOrder: [table.primaryFieldId, ...ids] });
              setDrag(null);
            }}
            className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50"
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={!hidden.has(f.id)}
                onChange={(e) =>
                  setHidden(e.target.checked ? [...hidden].filter((id) => id !== f.id) : [...hidden, f.id])
                }
              />
              <FieldIcon type={f.type} />
              <span className="truncate">{f.name}</span>
            </label>
            <GripVertical size={13} className="cursor-grab text-gray-300" />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-gray-100 pt-2">
        <button className="btn-ghost flex-1 py-1" onClick={() => setHidden(ordered.map((f) => f.id))}>
          Hide all
        </button>
        <button className="btn-ghost flex-1 py-1" onClick={() => setHidden([])}>
          Show all
        </button>
      </div>
    </div>
  );
}

function FilterValue({ field, cond, onChange }: { field: Field; cond: FilterCondition; onChange: (v: unknown) => void }) {
  const { resolver } = useBase();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const op = opsForType(field.type).find((o) => o.op === cond.op);
  if (op?.valueless) return <div className="flex-1" />;
  switch (field.type) {
    case "checkbox":
      return (
        <label className="flex flex-1 items-center gap-2">
          <input type="checkbox" checked={!!cond.value} onChange={(e) => onChange(e.target.checked)} /> checked
        </label>
      );
    case "user":
    case "createdBy":
    case "lastModifiedBy": {
      const val = Array.isArray(cond.value) ? cond.value[0] : cond.value;
      return (
        <>
          <button className="input flex-1 truncate py-1 text-left" onClick={(e) => setAnchor(e.currentTarget)}>
            {typeof val === "string" ? (resolver.userName(val) ?? "Unknown user") : <span className="text-gray-400">Select…</span>}
          </button>
          {anchor && (
            <Popover anchor={anchor} onClose={() => setAnchor(null)}>
              <UserPicker value={val} onChange={onChange} onDone={() => setAnchor(null)} />
            </Popover>
          )}
        </>
      );
    }
    case "singleSelect":
    case "multiSelect": {
      const multi = field.type === "multiSelect" || cond.op === "isAnyOf" || cond.op === "isNoneOf";
      const list = Array.isArray(cond.value) ? (cond.value as string[]) : typeof cond.value === "string" ? [cond.value] : [];
      const pickerField: Field = { ...field, type: multi ? "multiSelect" : "singleSelect" };
      return (
        <>
          <button className="input flex min-h-[30px] flex-1 flex-wrap items-center gap-1 py-1 text-left" onClick={(e) => setAnchor(e.currentTarget)}>
            {list.map((id) => {
              const c = field.options.choices?.find((x) => x.id === id);
              return c ? <ChoiceChip key={id} choice={c} /> : null;
            })}
            {!list.length && <span className="text-gray-400">Select…</span>}
          </button>
          {anchor && (
            <Popover anchor={anchor} onClose={() => setAnchor(null)}>
              <SelectPicker field={pickerField} value={multi ? list : (list[0] ?? null)} onChange={onChange} onDone={() => setAnchor(null)} />
            </Popover>
          )}
        </>
      );
    }
    case "date":
    case "createdTime":
    case "lastModifiedTime":
      return (
        <input
          type="date"
          className="input flex-1 py-1"
          value={toInputDate(cond.value, false)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "number":
    case "currency":
    case "percent":
    case "rating":
      return (
        <input
          className="input flex-1 py-1"
          inputMode="decimal"
          placeholder="Enter a value"
          value={(cond.value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          className="input flex-1 py-1"
          placeholder="Enter a value"
          value={(cond.value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function FilterEditor() {
  const { view, fields, patchView } = useBase();
  const filters: FilterSet = view.config.filters ?? { conjunction: "and", conditions: [] };
  const set = (f: FilterSet) => patchView({ filters: f });
  const update = (id: string, patch: Partial<FilterCondition>) =>
    set({ ...filters, conditions: filters.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <div className="w-[560px] max-w-[95vw] p-3">
      {!filters.conditions.length && <p className="mb-2 text-gray-500">No filter conditions are applied to this view.</p>}
      <div className="space-y-2">
        {filters.conditions.map((c, i) => {
          const field = fields.find((f) => f.id === c.fieldId);
          return (
            <div key={c.id} className="flex items-center gap-2">
              <div className="w-16 shrink-0 text-right text-gray-500">
                {i === 0 ? (
                  "Where"
                ) : i === 1 ? (
                  <select
                    className="rounded border border-gray-200 px-1 py-0.5"
                    value={filters.conjunction}
                    onChange={(e) => set({ ...filters, conjunction: e.target.value as "and" | "or" })}
                  >
                    <option value="and">and</option>
                    <option value="or">or</option>
                  </select>
                ) : (
                  filters.conjunction
                )}
              </div>
              <FieldSelect
                className="w-36 shrink-0"
                fields={fields}
                value={c.fieldId}
                onChange={(fieldId) => {
                  const f = fields.find((x) => x.id === fieldId)!;
                  update(c.id, { fieldId, op: defaultOp(f.type), value: undefined });
                }}
              />
              {field ? (
                <>
                  <select
                    className="input w-32 shrink-0 py-1"
                    value={c.op}
                    onChange={(e) => update(c.id, { op: e.target.value as FilterCondition["op"] })}
                  >
                    {opsForType(field.type).map((o) => (
                      <option key={o.op} value={o.op}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <FilterValue field={field} cond={c} onChange={(value) => update(c.id, { value })} />
                </>
              ) : (
                <span className="flex-1 text-red-500">Field deleted</span>
              )}
              <button
                className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => set({ ...filters, conditions: filters.conditions.filter((x) => x.id !== c.id) })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="mt-3 text-blue-700 hover:underline"
        onClick={() => {
          const f = fields[0];
          set({
            ...filters,
            conditions: [...filters.conditions, { id: newId("flt"), fieldId: f.id, op: defaultOp(f.type) }],
          });
        }}
      >
        + Add condition
      </button>
    </div>
  );
}

function SortEditor({ kind }: { kind: "sorts" | "groups" }) {
  const { view, fields, patchView } = useBase();
  const list: SortSpec[] = view.config[kind] ?? [];
  const set = (l: SortSpec[]) => patchView({ [kind]: l });
  const available = fields.filter((f) => f.type !== "attachment" && (kind === "sorts" || f.type !== "longText"));
  const label = (f: Field | undefined, dir: "asc" | "desc") => {
    const numeric = f && ["number", "currency", "percent", "rating", "date", "createdTime", "lastModifiedTime", "checkbox"].includes(f.type);
    if (f?.type === "checkbox") return dir === "asc" ? "☐ → ☑" : "☑ → ☐";
    if (numeric) return dir === "asc" ? "1 → 9" : "9 → 1";
    return dir === "asc" ? "A → Z" : "Z → A";
  };
  return (
    <div className="w-[400px] p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        {kind === "sorts" ? "Sort by" : "Group by"}
      </div>
      <div className="space-y-2">
        {list.map((s, i) => {
          const f = fields.find((x) => x.id === s.fieldId);
          return (
            <div key={i} className="flex items-center gap-2">
              <FieldSelect
                className="flex-1"
                fields={available}
                value={s.fieldId}
                onChange={(fieldId) => set(list.map((x, j) => (j === i ? { ...x, fieldId } : x)))}
              />
              <select
                className="input w-28 py-1"
                value={s.direction}
                onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, direction: e.target.value as "asc" | "desc" } : x)))}
              >
                <option value="asc">{label(f, "asc")}</option>
                <option value="desc">{label(f, "desc")}</option>
              </select>
              <button className="rounded p-1 text-gray-400 hover:bg-gray-100" onClick={() => set(list.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      {(kind === "sorts" || list.length < 3) && (
        <select
          className="input mt-2 py-1 text-gray-500"
          value=""
          onChange={(e) => e.target.value && set([...list, { fieldId: e.target.value, direction: "asc" }])}
        >
          <option value="">+ {kind === "sorts" ? "Add another sort" : "Add subgroup"}…</option>
          {available
            .filter((f) => !list.some((s) => s.fieldId === f.id))
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}

function LayoutSettings() {
  const { view, fields, patchView } = useBase();
  const cfg = view.config;
  if (view.type === "kanban") {
    const opts = fields.filter((f) => f.type === "singleSelect" || f.type === "user");
    return (
      <div className="w-72 space-y-2 p-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Stack records by</span>
          <select className="input" value={cfg.kanbanFieldId ?? ""} onChange={(e) => patchView({ kanbanFieldId: e.target.value })}>
            <option value="">Choose a field…</option>
            {opts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <CoverSetting />
      </div>
    );
  }
  if (view.type === "calendar") {
    const opts = fields.filter((f) => f.type === "date" || f.type === "createdTime" || f.type === "lastModifiedTime" || f.type === "formula");
    return (
      <div className="w-72 p-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Date field</span>
          <select className="input" value={cfg.calendarFieldId ?? ""} onChange={(e) => patchView({ calendarFieldId: e.target.value })}>
            <option value="">Choose a field…</option>
            {opts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }
  return (
    <div className="w-72 p-3">
      <CoverSetting />
    </div>
  );
}

function CoverSetting() {
  const { view, fields, patchView } = useBase();
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">Card cover image</span>
      <select className="input" value={view.config.coverFieldId ?? ""} onChange={(e) => patchView({ coverFieldId: e.target.value || undefined })}>
        <option value="">None</option>
        {fields
          .filter((f) => f.type === "attachment")
          .map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
      </select>
    </label>
  );
}
