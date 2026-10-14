"use client";

import clsx from "clsx";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  ChevronRight,
  Copy,
  EyeOff,
  Filter,
  Layers,
  Maximize2,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { recordsStore, useTables } from "@/client/store";
import { createRecords, deleteRecords, positionBetween, updateRecords } from "@/client/mutations";
import { coerceValue, isComputed } from "@/lib/fields";
import { newId } from "@/lib/ids";
import { defaultOp, groupRecords, searchRecords, viewRecords, visibleFields, type GroupNode } from "@/lib/query";
import type { Field, RecordRow } from "@/lib/types";
import { ContextMenu, Menu, Popover, toast, toastError, type MenuItem } from "../ui";
import { useBase } from "./context";
import { AttachmentEditor, CellDisplay, LinkPicker, SelectPicker, UserPicker, fromInputDate, toInputDate } from "./cells";
import { FieldEditor } from "./FieldEditor";
import { FieldIcon } from "./FieldIcon";
import { api } from "@/client/api";

const ROW_H = 33;
const GROUP_H = 40;
const HEADER_H = 33;
const GUTTER_W = 72;
const DEFAULT_W = 180;
const PRIMARY_W = 240;

type Item =
  | { kind: "group"; node: GroupNode; collapsed: boolean }
  | { kind: "row"; record: RecordRow; rowIndex: number; depth: number }
  | { kind: "add"; node?: GroupNode; depth: number };

const TEXT_TYPES = new Set(["text", "email", "url", "phone", "number", "currency", "percent", "longText"]);
const PICKER_TYPES = new Set(["singleSelect", "multiSelect", "link", "user", "attachment", "date"]);

function parseClipboard(text: string): string[][] {
  // Handles Excel/Sheets TSV, including quoted multi-line cells.
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === "\t") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function GridView() {
  const ctx = useBase();
  const { base, table, view, fields, resolver, canEdit, canSchema, search, patchView, openRecord, confirm, reloadBase } = ctx;
  const { loading } = useTables([table.id]);
  const getter = resolver.getter(table.id);
  const allRecords = recordsStore.records(table.id);

  const [sticky, setSticky] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<{ rowId: string; fieldId: string } | null>(null);
  const [editing, setEditing] = useState<{ rowId: string; fieldId: string; initial?: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fieldMenu, setFieldMenu] = useState<{ field: Field; anchor: HTMLElement } | null>(null);
  const [fieldEditor, setFieldEditor] = useState<{ field?: Field; anchor: HTMLElement } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ record: RecordRow; at: { x: number; y: number } } | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>(view.config.fieldWidths ?? {});
  const [dragField, setDragField] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 800 });

  useEffect(() => setWidths(view.config.fieldWidths ?? {}), [view.config.fieldWidths]);

  const vis = useMemo(() => visibleFields(fields, view, table.primaryFieldId), [fields, view, table.primaryFieldId]);
  const colW = (f: Field) => widths[f.id] ?? (f.id === table.primaryFieldId ? PRIMARY_W : DEFAULT_W);

  // ------------------------------------------------------------- rows
  const rows = useMemo(() => {
    const filtered = viewRecords(allRecords, view, getter);
    if (sticky.size) {
      const present = new Set(filtered.map((r) => r.id));
      for (const r of allRecords) if (sticky.has(r.id) && !present.has(r.id)) filtered.push(r);
    }
    return searchRecords(filtered, vis, search, getter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRecords, view, getter, sticky, search, vis]);

  const groups = view.config.groups?.filter((g) => fields.some((f) => f.id === g.fieldId)) ?? [];
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    let rowIndex = 0;
    if (!groups.length) {
      for (const r of rows) out.push({ kind: "row", record: r, rowIndex: rowIndex++, depth: 0 });
      if (canEdit) out.push({ kind: "add", depth: 0 });
      return out;
    }
    const walk = (nodes: GroupNode[]) => {
      for (const n of nodes) {
        const isCollapsed = collapsed.has(n.key);
        out.push({ kind: "group", node: n, collapsed: isCollapsed });
        if (isCollapsed) continue;
        if (n.children) walk(n.children);
        else {
          for (const r of n.records) out.push({ kind: "row", record: r, rowIndex: rowIndex++, depth: n.depth + 1 });
          if (canEdit) out.push({ kind: "add", node: n, depth: n.depth + 1 });
        }
      }
    };
    walk(groupRecords(rows, groups, getter));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, JSON.stringify(groups), collapsed, canEdit, getter]);

  const rowItems = useMemo(() => items.filter((i): i is Extract<Item, { kind: "row" }> => i.kind === "row"), [items]);
  const offsets = useMemo(() => {
    const o: number[] = [];
    let y = 0;
    for (const it of items) {
      o.push(y);
      y += it.kind === "group" ? GROUP_H : ROW_H;
    }
    o.push(y);
    return o;
  }, [items]);
  const totalH = offsets[offsets.length - 1];

  // visible window
  let start = 0;
  {
    let lo = 0;
    let hi = items.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= scroll.top) lo = mid + 1;
      else hi = mid - 1;
    }
    start = Math.max(0, lo - 8);
  }
  let end = start;
  while (end < items.length && offsets[end] < scroll.top + scroll.height + 300) end++;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setScroll({ top: el.scrollTop, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ------------------------------------------------------------- selection helpers
  const rowIdx = (rowId: string) => rowItems.findIndex((r) => r.record.id === rowId);
  const colIdx = (fieldId: string) => vis.findIndex((f) => f.id === fieldId);

  const scrollIntoView = useCallback(
    (rowId: string, fieldId: string) => {
      const el = scrollRef.current;
      if (!el) return;
      const itemIndex = items.findIndex((i) => i.kind === "row" && i.record.id === rowId);
      if (itemIndex >= 0) {
        const top = offsets[itemIndex];
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + ROW_H > el.scrollTop + el.clientHeight - HEADER_H) el.scrollTop = top + ROW_H - el.clientHeight + HEADER_H + 4;
      }
      const ci = vis.findIndex((f) => f.id === fieldId);
      if (ci > 0) {
        let left = GUTTER_W;
        for (let i = 0; i < ci; i++) left += colW(vis[i]);
        const frozen = GUTTER_W + colW(vis[0]);
        const w = colW(vis[ci]);
        if (left - frozen + GUTTER_W < el.scrollLeft + GUTTER_W) el.scrollLeft = left - frozen;
        else if (left + w > el.scrollLeft + el.clientWidth) el.scrollLeft = left + w - el.clientWidth + 4;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, offsets, vis, widths],
  );

  const move = (dr: number, dc: number) => {
    if (!rowItems.length || !vis.length) return;
    let r = active ? rowIdx(active.rowId) : 0;
    let c = active ? colIdx(active.fieldId) : 0;
    if (r < 0) r = 0;
    if (c < 0) c = 0;
    r = Math.max(0, Math.min(rowItems.length - 1, r + dr));
    c = Math.max(0, Math.min(vis.length - 1, c + dc));
    const next = { rowId: rowItems[r].record.id, fieldId: vis[c].id };
    setActive(next);
    scrollIntoView(next.rowId, next.fieldId);
  };

  const focusGrid = () => scrollRef.current?.focus({ preventScroll: true });

  // ------------------------------------------------------------- mutations
  const setCell = (record: RecordRow, field: Field, value: unknown) => {
    if (!canEdit || isComputed(field.type)) return;
    updateRecords(table.id, fields, [{ id: record.id, fields: { [field.id]: coerceValue(field, value) } }]);
  };

  const groupDefaults = (node?: GroupNode): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (!node) return out;
    // Walk up the group path via keys: collect values from ancestors in `items`
    const chain: GroupNode[] = [];
    for (const it of items) if (it.kind === "group" && node.key.startsWith(it.node.key)) chain.push(it.node);
    for (const n of chain) {
      const f = fields.find((x) => x.id === n.fieldId);
      if (f && !isComputed(f.type) && n.value !== null && n.value !== undefined) out[f.id] = n.value;
    }
    return out;
  };

  const addRecord = async (opts: { node?: GroupNode; position?: number; data?: Record<string, unknown> } = {}) => {
    const data = { ...groupDefaults(opts.node), ...(opts.data ?? {}) };
    // Prefill from filters with simple equality, like Airtable
    for (const c of view.config.filters?.conditions ?? []) {
      const f = fields.find((x) => x.id === c.fieldId);
      if (!f || isComputed(f.type) || c.value === undefined || c.value === null || c.value === "") continue;
      if (c.op === "is" && view.config.filters?.conjunction !== "or") data[f.id] ??= c.value;
      if (c.op === "hasAnyOf" && Array.isArray(c.value)) data[f.id] ??= c.value.slice(0, 1);
    }
    const [rec] = await createRecords(table.id, fields, [{ fields: data, position: opts.position }]);
    if (rec) {
      setSticky((s) => new Set(s).add(rec.id));
      setActive({ rowId: rec.id, fieldId: table.primaryFieldId });
      requestAnimationFrame(() => scrollIntoView(rec.id, table.primaryFieldId));
      focusGrid();
    }
    return rec;
  };

  const deleteRows = async (ids: string[]) => {
    if (!ids.length) return;
    if (ids.length > 1 && !(await confirm(`Delete ${ids.length} records?`))) return;
    await deleteRecords(table.id, fields, ids);
    setSelected(new Set());
    toast(`Deleted ${ids.length} record${ids.length > 1 ? "s" : ""}`);
  };

  const startEdit = (rowId: string, fieldId: string, initial?: string) => {
    const field = fields.find((f) => f.id === fieldId);
    const record = allRecords.find((r) => r.id === rowId);
    if (!field || !record || !canEdit || isComputed(field.type)) return;
    if (field.type === "checkbox") return setCell(record, field, !record.data[field.id]);
    if (field.type === "rating") return;
    setActive({ rowId, fieldId });
    setEditing({ rowId, fieldId, initial });
  };

  // ------------------------------------------------------------- clipboard
  const copy = async () => {
    let text = "";
    if (selected.size) {
      const recs = rowItems.filter((r) => selected.has(r.record.id)).map((r) => r.record);
      text = recs.map((r) => vis.map((f) => getter.text(r, f).replace(/[\t\n]/g, " ")).join("\t")).join("\n");
    } else if (active) {
      const r = allRecords.find((x) => x.id === active.rowId);
      const f = fields.find((x) => x.id === active.fieldId);
      if (r && f) text = getter.text(r, f);
    }
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => {});
    toast(selected.size ? `Copied ${selected.size} rows` : "Copied cell");
  };

  const linkIdsFromText = (field: Field, text: string): string[] => {
    const tid = field.options.linkedTableId;
    if (!tid) return [];
    const names = text.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const recs = recordsStore.records(tid);
    return names
      .map((n) => recs.find((r) => r.id.toLowerCase() === n || resolver.primaryText(tid, r).toLowerCase() === n)?.id)
      .filter((x): x is string => !!x);
  };

  const paste = async (text: string) => {
    if (!active || !canEdit) return;
    const grid = parseClipboard(text);
    if (!grid.length) return;
    const r0 = rowIdx(active.rowId);
    const c0 = colIdx(active.fieldId);
    if (r0 < 0 || c0 < 0) return;
    const updates: { id: string; fields: Record<string, unknown> }[] = [];
    const creates: { fields: Record<string, unknown> }[] = [];
    let touchesSelect = false;
    grid.forEach((cells, i) => {
      const data: Record<string, unknown> = {};
      cells.forEach((value, j) => {
        const f = vis[c0 + j];
        if (!f || isComputed(f.type)) return;
        if (f.type === "singleSelect" || f.type === "multiSelect") touchesSelect = true;
        if (f.type === "link") data[f.id] = linkIdsFromText(f, value);
        else if (f.type === "user") data[f.id] = base.members.find((m) => m.name === value || m.email === value)?.userId ?? null;
        else data[f.id] = value;
      });
      const target = rowItems[r0 + i];
      if (target) updates.push({ id: target.record.id, fields: data });
      else if (!groups.length) creates.push({ fields: data });
    });
    if (grid.length === 1 && grid[0].length === 1 && rowItems[r0]) {
      // single value pasted over a multi-row selection fills the selection
      if (selected.size > 1) {
        const f = vis[c0];
        for (const id of selected) if (id !== rowItems[r0].record.id) updates.push({ id, fields: { [f.id]: updates[0].fields[f.id] } });
      }
    }
    await updateRecords(table.id, fields, updates, { typecast: true });
    if (creates.length) {
      const recs = await createRecords(table.id, fields, creates, { typecast: true });
      setSticky((s) => new Set([...s, ...recs.map((r) => r.id)]));
    }
    if (touchesSelect) reloadBase();
    const n = updates.length + creates.length;
    if (n > 1) toast(`Pasted into ${n} records`);
  };

  // ------------------------------------------------------------- keyboard
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copy();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(new Set(rowItems.map((r) => r.record.id)));
      return;
    }
    if (!active) {
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key)) {
        e.preventDefault();
        move(0, 0);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return mod ? move(1e9, 0) : move(1, 0);
      case "ArrowUp":
        e.preventDefault();
        return mod ? move(-1e9, 0) : move(-1, 0);
      case "ArrowLeft":
        e.preventDefault();
        return mod ? move(0, -1e9) : move(0, -1);
      case "ArrowRight":
        e.preventDefault();
        return mod ? move(0, 1e9) : move(0, 1);
      case "Tab":
        e.preventDefault();
        return move(0, e.shiftKey ? -1 : 1);
      case "Enter":
        e.preventDefault();
        if (e.shiftKey) return addRecord({ position: positionBetween(rows, rowIdx(active.rowId), "below") });
        return startEdit(active.rowId, active.fieldId);
      case " ":
        if (e.shiftKey) {
          e.preventDefault();
          return openRecord(table.id, active.rowId, rowItems.map((r) => r.record.id));
        }
        break;
      case "Escape":
        setActive(null);
        setSelected(new Set());
        return;
      case "Backspace":
      case "Delete": {
        e.preventDefault();
        if (!canEdit) return;
        if (selected.size && (e.metaKey || e.ctrlKey)) return deleteRows([...selected]);
        const f = fields.find((x) => x.id === active.fieldId);
        const r = allRecords.find((x) => x.id === active.rowId);
        if (f && r) setCell(r, f, null);
        return;
      }
    }
    if (e.key.length === 1 && !mod && !e.altKey) {
      const f = fields.find((x) => x.id === active.fieldId);
      if (f && TEXT_TYPES.has(f.type)) {
        e.preventDefault();
        startEdit(active.rowId, active.fieldId, e.key);
      } else if (f && e.key !== " ") {
        e.preventDefault();
        startEdit(active.rowId, active.fieldId);
      }
    }
  };

  // ------------------------------------------------------------- column ops
  const saveWidth = (fieldId: string, w: number) => {
    const next = { ...widths, [fieldId]: w };
    setWidths(next);
    patchView({ fieldWidths: next });
  };

  const startResize = (e: React.MouseEvent, f: Field) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colW(f);
    let w = startW;
    const onMove = (ev: MouseEvent) => {
      w = Math.max(80, Math.min(800, startW + ev.clientX - startX));
      setWidths((m) => ({ ...m, [f.id]: w }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      saveWidth(f.id, w);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const reorderField = (from: string, to: string) => {
    if (from === to || from === table.primaryFieldId || to === table.primaryFieldId) return;
    const ids = vis.map((f) => f.id).filter((id) => id !== from);
    ids.splice(ids.indexOf(to), 0, from);
    const hidden = fields.filter((f) => !ids.includes(f.id) && f.id !== from).map((f) => f.id);
    patchView({ fieldOrder: [...ids, ...hidden] });
  };

  const fieldMenuItems = (f: Field): MenuItem[] => {
    const isPrimary = f.id === table.primaryFieldId;
    return [
      { label: "Edit field", icon: <Pencil size={14} />, disabled: !canSchema, onClick: () => setFieldEditor({ field: f, anchor: fieldMenu!.anchor }) },
      { divider: true, label: "" },
      { label: "Sort first → last", icon: <ArrowDownAZ size={14} />, onClick: () => patchView({ sorts: [{ fieldId: f.id, direction: "asc" }] }) },
      { label: "Sort last → first", icon: <ArrowUpAZ size={14} />, onClick: () => patchView({ sorts: [{ fieldId: f.id, direction: "desc" }] }) },
      {
        label: "Filter by this field",
        icon: <Filter size={14} />,
        onClick: () => {
          const filters = view.config.filters ?? { conjunction: "and" as const, conditions: [] };
          patchView({ filters: { ...filters, conditions: [...filters.conditions, { id: newId("flt"), fieldId: f.id, op: defaultOp(f.type) }] } });
          toast("Filter added — set its value in the Filter menu");
        },
      },
      { label: "Group by this field", icon: <Layers size={14} />, onClick: () => patchView({ groups: [{ fieldId: f.id, direction: "asc" }] }) },
      { divider: true, label: "" },
      {
        label: "Set as primary field",
        icon: <Star size={14} />,
        disabled: !canSchema || isPrimary || ["link", "attachment", "checkbox", "multiSelect", "user"].includes(f.type),
        onClick: async () => {
          try {
            await api(`/api/tables/${table.id}`, { method: "PATCH", body: { primaryFieldId: f.id } });
            await reloadBase();
          } catch (e) {
            toastError(e);
          }
        },
      },
      {
        label: "Hide field",
        icon: <EyeOff size={14} />,
        disabled: isPrimary,
        onClick: () => patchView({ hiddenFieldIds: [...(view.config.hiddenFieldIds ?? []), f.id] }),
      },
      {
        label: "Delete field",
        icon: <Trash2 size={14} />,
        danger: true,
        disabled: !canSchema || isPrimary,
        onClick: async () => {
          if (!(await confirm(`Delete field "${f.name}"? Its data will be lost.${f.type === "link" ? " The linked field in the other table is removed too." : ""}`))) return;
          try {
            await api(`/api/fields/${f.id}`, { method: "DELETE" });
            await reloadBase();
          } catch (e) {
            toastError(e);
          }
        },
      },
    ];
  };

  // ------------------------------------------------------------- render
  const totalW = GUTTER_W + vis.reduce((s, f) => s + colW(f), 0) + (canSchema ? 120 : 0);
  const primaryW = vis[0] ? colW(vis[0]) : 0;

  const editingField = editing && fields.find((f) => f.id === editing.fieldId);
  const editingRecord = editing && allRecords.find((r) => r.id === editing.rowId);

  const renderCells = (record: RecordRow) =>
    vis.map((f, ci) => {
      const isActive = active?.rowId === record.id && active.fieldId === f.id;
      const isPrimary = ci === 0;
      const value = getter.get(record, f);
      return (
        <div
          key={f.id}
          data-cell={`${record.id}:${f.id}`}
          className={clsx(
            "relative flex h-full shrink-0 items-center border-r border-[var(--grid-border)] px-2",
            isPrimary && "sticky z-[2] bg-inherit",
            isActive && "z-[3] rounded-sm outline outline-2 -outline-offset-1 outline-[#2d7ff9]",
          )}
          style={{ width: colW(f), left: isPrimary ? GUTTER_W : undefined }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            const wasActive = isActive;
            setActive({ rowId: record.id, fieldId: f.id });
            if (!e.shiftKey && !(e.metaKey || e.ctrlKey)) setSelected(new Set());
            if (wasActive && !editing && (TEXT_TYPES.has(f.type) || PICKER_TYPES.has(f.type))) {
              e.preventDefault();
              startEdit(record.id, f.id);
            }
          }}
          onDoubleClick={() => startEdit(record.id, f.id)}
        >
          <CellDisplay
            field={f}
            value={value}
            onToggle={canEdit && f.type === "checkbox" ? () => setCell(record, f, !record.data[f.id]) : undefined}
            onRate={canEdit && f.type === "rating" ? (v) => setCell(record, f, v) : undefined}
          />
        </div>
      );
    });

  return (
    <div className="absolute inset-0 flex flex-col bg-[#f7f8fa]">
      <div
        ref={scrollRef}
        tabIndex={0}
        className="relative min-h-0 flex-1 overflow-auto outline-none"
        onScroll={(e) => {
          const el = e.currentTarget;
          setScroll({ top: el.scrollTop, height: el.clientHeight });
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          if (editing) return;
          const text = e.clipboardData.getData("text/plain");
          if (text) {
            e.preventDefault();
            paste(text);
          }
        }}
      >
        <div style={{ width: totalW, minWidth: "100%" }}>
          {/* header */}
          <div className="sticky top-0 z-10 flex border-b border-[var(--grid-border)] bg-[var(--grid-header)]" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-[3] flex shrink-0 items-center border-r border-[var(--grid-border)] bg-[var(--grid-header)] pl-3" style={{ width: GUTTER_W }}>
              <input
                type="checkbox"
                className="opacity-60"
                checked={rowItems.length > 0 && selected.size === rowItems.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(rowItems.map((r) => r.record.id)) : new Set())}
                aria-label="Select all"
              />
            </div>
            {vis.map((f, ci) => (
              <div
                key={f.id}
                draggable={ci > 0}
                onDragStart={() => setDragField(f.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragField && reorderField(dragField, f.id)}
                className={clsx(
                  "group relative flex h-full shrink-0 cursor-default items-center gap-1.5 border-r border-[var(--grid-border)] bg-[var(--grid-header)] px-2 font-medium text-gray-700",
                  ci === 0 && "sticky z-[3]",
                )}
                style={{ width: colW(f), left: ci === 0 ? GUTTER_W : undefined }}
                title={f.description || f.name}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setFieldMenu({ field: f, anchor: e.currentTarget });
                }}
              >
                <FieldIcon type={f.type} size={13} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button
                  className="rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 group-hover:opacity-100"
                  onClick={(e) => setFieldMenu({ field: f, anchor: e.currentTarget.parentElement! })}
                  aria-label={`${f.name} options`}
                >
                  <ChevronDown size={13} />
                </button>
                <div className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-blue-400/60" onMouseDown={(e) => startResize(e, f)} />
              </div>
            ))}
            {canSchema && (
              <button
                className="flex h-full w-[120px] shrink-0 items-center justify-center border-r border-[var(--grid-border)] text-gray-500 hover:bg-gray-200"
                onClick={(e) => setFieldEditor({ anchor: e.currentTarget })}
                aria-label="Add field"
              >
                <Plus size={16} />
              </button>
            )}
          </div>

          {/* body */}
          <div className="relative" style={{ height: totalH }}>
            {items.slice(start, end).map((it, k) => {
              const i = start + k;
              const top = offsets[i];
              if (it.kind === "group") {
                const f = fields.find((x) => x.id === it.node.fieldId)!;
                return (
                  <div
                    key={`g:${it.node.key}`}
                    className="absolute left-0 flex items-end"
                    style={{ top, height: GROUP_H, width: totalW }}
                  >
                    <div
                      className="sticky left-0 flex h-[34px] items-center gap-2 rounded-t-md border border-b-0 border-[var(--grid-border)] bg-white px-2"
                      style={{ marginLeft: it.node.depth * 16, width: Math.min(totalW - it.node.depth * 16, 900) }}
                    >
                      <button
                        className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                        onClick={() =>
                          setCollapsed((s) => {
                            const n = new Set(s);
                            if (n.has(it.node.key)) n.delete(it.node.key);
                            else n.add(it.node.key);
                            return n;
                          })
                        }
                      >
                        {it.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      </button>
                      <span className="text-xs text-gray-500">{f.name}</span>
                      <span className="min-w-0 max-w-[400px] overflow-hidden">
                        {it.node.label ? <CellDisplay field={f} value={it.node.value} /> : <span className="text-gray-400">Empty</span>}
                      </span>
                      <span className="text-xs text-gray-400">{it.node.records.length}</span>
                    </div>
                  </div>
                );
              }
              if (it.kind === "add") {
                return (
                  <div key={`a:${it.node?.key ?? ""}`} className="absolute left-0 flex" style={{ top, height: ROW_H, width: totalW }}>
                    <button
                      className="sticky left-0 flex h-full items-center gap-2 border-b border-r border-[var(--grid-border)] bg-white pl-4 text-gray-500 hover:bg-gray-50"
                      style={{ width: GUTTER_W + primaryW, marginLeft: groups.length ? 0 : 0 }}
                      onClick={() => addRecord({ node: it.node })}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                );
              }
              const r = it.record;
              const isSel = selected.has(r.id);
              const isActiveRow = active?.rowId === r.id;
              return (
                <div
                  key={r.id}
                  className={clsx(
                    "group/row absolute left-0 flex border-b border-[var(--grid-border)]",
                    isSel ? "bg-blue-50" : isActiveRow ? "bg-[#f8faff]" : "bg-white hover:bg-[#f8f9fb]",
                  )}
                  style={{ top, height: ROW_H, width: totalW }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRowMenu({ record: r, at: { x: e.clientX, y: e.clientY } });
                  }}
                >
                  <div
                    className="sticky left-0 z-[2] flex h-full shrink-0 items-center gap-1 border-r border-[var(--grid-border)] bg-inherit pl-2 text-xs text-gray-400"
                    style={{ width: GUTTER_W }}
                  >
                    <span className={clsx("w-6 text-center tabular-nums", isSel ? "hidden" : "group-hover/row:hidden")}>{it.rowIndex + 1}</span>
                    <input
                      type="checkbox"
                      className={clsx(isSel ? "" : "hidden group-hover/row:inline")}
                      checked={isSel}
                      onChange={(e) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(r.id);
                          else n.delete(r.id);
                          return n;
                        })
                      }
                      aria-label="Select row"
                    />
                    <button
                      className="ml-auto mr-1 rounded p-1 text-blue-500 opacity-0 hover:bg-blue-50 group-hover/row:opacity-100"
                      onClick={() => openRecord(table.id, r.id, rowItems.map((x) => x.record.id))}
                      title="Expand record (Shift+Space)"
                    >
                      <Maximize2 size={12} />
                    </button>
                  </div>
                  {renderCells(r)}
                </div>
              );
            })}
          </div>
        </div>
        {!loading && rows.length === 0 && (search || view.config.filters?.conditions.length) ? (
          <div className="pointer-events-none absolute inset-x-0 top-28 text-center text-gray-400">No records match this view</div>
        ) : null}
        {loading && <div className="absolute inset-x-0 top-28 text-center text-gray-400">Loading records…</div>}
        {editing && editingField && editingRecord && (
          <CellEditor
            key={`${editing.rowId}:${editing.fieldId}`}
            field={editingField}
            record={editingRecord}
            initial={editing.initial}
            container={scrollRef.current!}
            onCommit={(value, nav) => {
              if (value !== undefined) setCell(editingRecord, editingField, value);
              setEditing(null);
              focusGrid();
              if (nav === "down") move(1, 0);
              if (nav === "right") move(0, 1);
              if (nav === "left") move(0, -1);
            }}
          />
        )}
      </div>
      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-gray-200 bg-white px-3 text-xs text-gray-500">
        <span>
          {rows.length} {rows.length === 1 ? "record" : "records"}
        </span>
        {selected.size > 0 && (
          <>
            <span className="text-blue-700">{selected.size} selected</span>
            <button className="flex items-center gap-1 hover:text-gray-800" onClick={copy}>
              <Copy size={12} /> Copy
            </button>
            {canEdit && (
              <button className="flex items-center gap-1 text-red-600 hover:text-red-700" onClick={() => deleteRows([...selected])}>
                <Trash2 size={12} /> Delete
              </button>
            )}
            <button className="hover:text-gray-800" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </>
        )}
      </div>

      {fieldMenu && (
        <Popover anchor={fieldMenu.anchor} onClose={() => setFieldMenu(null)}>
          <Menu items={fieldMenuItems(fieldMenu.field)} onClose={() => setFieldMenu(null)} />
        </Popover>
      )}
      {fieldEditor && (
        <Popover anchor={fieldEditor.anchor} onClose={() => setFieldEditor(null)}>
          <FieldEditor field={fieldEditor.field} onClose={() => setFieldEditor(null)} />
        </Popover>
      )}
      {rowMenu && (
        <ContextMenu
          at={rowMenu.at}
          onClose={() => setRowMenu(null)}
          items={[
            { label: "Expand record", icon: <Maximize2 size={14} />, onClick: () => openRecord(table.id, rowMenu.record.id, rowItems.map((x) => x.record.id)) },
            { divider: true, label: "" },
            {
              label: "Insert record above",
              icon: <Plus size={14} />,
              disabled: !canEdit,
              onClick: () => addRecord({ position: positionBetween(allRecords, allRecords.indexOf(rowMenu.record), "above") }),
            },
            {
              label: "Insert record below",
              icon: <Plus size={14} />,
              disabled: !canEdit,
              onClick: () => addRecord({ position: positionBetween(allRecords, allRecords.indexOf(rowMenu.record), "below") }),
            },
            {
              label: "Duplicate record",
              icon: <Copy size={14} />,
              disabled: !canEdit,
              onClick: () =>
                addRecord({
                  position: positionBetween(allRecords, allRecords.indexOf(rowMenu.record), "below"),
                  data: Object.fromEntries(
                    Object.entries(rowMenu.record.data).filter(([k]) => {
                      const f = fields.find((x) => x.id === k);
                      return f && !isComputed(f.type);
                    }),
                  ),
                }),
            },
            { divider: true, label: "" },
            selected.size > 1 && selected.has(rowMenu.record.id)
              ? { label: `Delete ${selected.size} selected records`, icon: <Trash2 size={14} />, danger: true, disabled: !canEdit, onClick: () => deleteRows([...selected]) }
              : { label: "Delete record", icon: <Trash2 size={14} />, danger: true, disabled: !canEdit, onClick: () => deleteRows([rowMenu.record.id]) },
          ]}
        />
      )}
    </div>
  );
}

/** Editor overlay positioned over the active cell. */
function CellEditor({
  field,
  record,
  initial,
  container,
  onCommit,
}: {
  field: Field;
  record: RecordRow;
  initial?: string;
  container: HTMLElement;
  onCommit: (value: unknown, nav?: "down" | "right" | "left") => void;
}) {
  // Escape/Enter unmount the input, which can fire a trailing blur: only commit once.
  const done = useRef(false);
  const original = record.data[field.id] === null || record.data[field.id] === undefined ? "" : String(record.data[field.id]);
  const finish = (v: unknown, nav?: "down" | "right" | "left") => {
    if (done.current) return;
    done.current = true;
    onCommit(typeof v === "string" && v === original ? undefined : v, nav);
  };
  const cell = container.querySelector<HTMLElement>(`[data-cell="${record.id}:${field.id}"]`);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [value, setValue] = useState<unknown>(record.data[field.id] ?? null);
  const [text, setText] = useState<string>(() => {
    if (initial !== undefined) return initial;
    const v = record.data[field.id];
    return v === null || v === undefined ? "" : String(v);
  });

  useLayoutEffect(() => {
    if (!cell) return;
    const c = container.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    setRect({ top: r.top - c.top + container.scrollTop, left: r.left - c.left + container.scrollLeft, width: r.width, height: r.height });
  }, [cell, container]);

  if (!cell) return null;

  if (PICKER_TYPES.has(field.type)) {
    const commit = (v: unknown) => setValue(v);
    const close = () => finish(JSON.stringify(value) === JSON.stringify(record.data[field.id] ?? null) ? undefined : value);
    return (
      <Popover anchor={cell} onClose={close}>
        {field.type === "singleSelect" || field.type === "multiSelect" ? (
          <SelectPicker
            field={field}
            value={value}
            onChange={(v) => {
              commit(v);
              if (field.type === "singleSelect") finish(v);
            }}
          />
        ) : field.type === "link" ? (
          <LinkPicker field={field} value={value} onChange={commit} />
        ) : field.type === "user" ? (
          <UserPicker value={value} onChange={(v) => finish(v)} />
        ) : field.type === "attachment" ? (
          <AttachmentEditor value={value} onChange={commit} />
        ) : (
          <div className="p-2">
            <input
              autoFocus
              className="input"
              type={field.options.includeTime ? "datetime-local" : "date"}
              defaultValue={toInputDate(record.data[field.id], !!field.options.includeTime)}
              onChange={(e) => commit(fromInputDate(e.target.value, !!field.options.includeTime))}
              onKeyDown={(e) => {
                if (e.key === "Enter") finish(fromInputDate((e.target as HTMLInputElement).value, !!field.options.includeTime), "down");
              }}
            />
            <div className="mt-2 flex justify-between">
              <button className="btn-ghost py-1" onClick={() => finish(null)}>
                Clear
              </button>
              <button
                className="btn-ghost py-1"
                onClick={() => {
                  const now = new Date();
                  finish(field.options.includeTime ? now.toISOString() : fromInputDate(toInputDate(now.toISOString(), false), false));
                }}
              >
                Today
              </button>
            </div>
          </div>
        )}
      </Popover>
    );
  }

  if (!rect) return null;
  const numeric = field.type === "number" || field.type === "currency" || field.type === "percent";

  if (field.type === "longText") {
    return (
      <textarea
        autoFocus
        className="absolute z-20 resize rounded-sm border-2 border-[#2d7ff9] bg-white p-2 shadow-lg outline-none"
        style={{ top: rect.top, left: rect.left, width: Math.max(rect.width, 320), minHeight: 140 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
        onBlur={() => finish(text)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") finish(undefined);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finish(text, "down");
          if (e.key === "Tab") {
            e.preventDefault();
            finish(text, e.shiftKey ? "left" : "right");
          }
        }}
      />
    );
  }

  return (
    <input
      autoFocus
      className={clsx("absolute z-20 rounded-sm border-2 border-[#2d7ff9] bg-white px-2 shadow-lg outline-none", numeric && "text-right")}
      style={{ top: rect.top, left: rect.left, width: Math.max(rect.width, 160), height: rect.height }}
      value={text}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => {
        if (initial !== undefined) e.currentTarget.setSelectionRange(text.length, text.length);
        else e.currentTarget.select();
      }}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") finish(undefined);
        if (e.key === "Enter") finish(text, "down");
        if (e.key === "Tab") {
          e.preventDefault();
          finish(text, e.shiftKey ? "left" : "right");
        }
      }}
    />
  );
}
