import { newId } from "./ids";
import type { Choice, Field, FieldOptions, FieldType } from "./types";

export interface FieldTypeInfo {
  type: FieldType;
  label: string;
  computed?: boolean;
}

export const FIELD_TYPES: FieldTypeInfo[] = [
  { type: "text", label: "Single line text" },
  { type: "longText", label: "Long text" },
  { type: "number", label: "Number" },
  { type: "currency", label: "Currency" },
  { type: "percent", label: "Percent" },
  { type: "checkbox", label: "Checkbox" },
  { type: "singleSelect", label: "Single select" },
  { type: "multiSelect", label: "Multiple select" },
  { type: "date", label: "Date" },
  { type: "email", label: "Email" },
  { type: "url", label: "URL" },
  { type: "phone", label: "Phone number" },
  { type: "rating", label: "Rating" },
  { type: "link", label: "Link to another record" },
  { type: "attachment", label: "Attachment" },
  { type: "user", label: "User" },
  { type: "formula", label: "Formula", computed: true },
  { type: "createdTime", label: "Created time", computed: true },
  { type: "lastModifiedTime", label: "Last modified time", computed: true },
  { type: "createdBy", label: "Created by", computed: true },
  { type: "lastModifiedBy", label: "Last modified by", computed: true },
];

export const FIELD_TYPE_SET = new Set<string>(FIELD_TYPES.map((t) => t.type));

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPES.find((t) => t.type === type)?.label ?? type;
}

export function isComputed(type: FieldType): boolean {
  return !!FIELD_TYPES.find((t) => t.type === type)?.computed;
}

export const COLORS = ["blue", "cyan", "teal", "green", "yellow", "orange", "red", "pink", "purple", "gray"] as const;
export type Color = (typeof COLORS)[number];

export function defaultOptions(type: FieldType): FieldOptions {
  switch (type) {
    case "number":
      return { precision: 0 };
    case "currency":
      return { precision: 2, symbol: "$" };
    case "percent":
      return { precision: 0 };
    case "singleSelect":
    case "multiSelect":
      return { choices: [] };
    case "date":
      return { includeTime: false };
    case "rating":
      return { max: 5 };
    case "formula":
      return { formula: "" };
    default:
      return {};
  }
}

export interface Attachment {
  url: string;
  name: string;
}

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "" || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[,\s$€£¥%]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(v: unknown, includeTime: boolean): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return includeTime ? new Date(`${s}T00:00:00`).toISOString() : s;
    }
    // US style M/D/YYYY
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) {
      const d = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
      return includeTime ? d.toISOString() : toDateOnly(d);
    }
  }
  const d = v instanceof Date ? v : new Date(typeof v === "number" ? v : String(v));
  if (Number.isNaN(d.getTime())) return null;
  return includeTime ? d.toISOString() : toDateOnly(d);
}

const TRUE_STRINGS = new Set(["true", "yes", "y", "1", "checked", "x", "✓", "✔", "on"]);

function findChoice(choices: Choice[], v: unknown): Choice | undefined {
  if (typeof v !== "string") return undefined;
  const byId = choices.find((c) => c.id === v);
  if (byId) return byId;
  const lower = v.trim().toLowerCase();
  return choices.find((c) => c.name.toLowerCase() === lower);
}

function splitList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (v === null || v === undefined) return [];
  return [v];
}

/**
 * Coerce an arbitrary input into the stored representation for a field.
 * Returns null for "empty". Computed fields always return null.
 */
export function coerceValue(field: Pick<Field, "type" | "options">, v: unknown): unknown {
  const o = field.options ?? {};
  switch (field.type) {
    case "text":
    case "email":
    case "url":
    case "phone": {
      if (v === null || v === undefined) return null;
      const s = Array.isArray(v) ? v.join(", ") : String(v);
      const one = s.replace(/[\r\n]+/g, " ");
      return one === "" ? null : one;
    }
    case "longText": {
      if (v === null || v === undefined) return null;
      const s = Array.isArray(v) ? v.join(", ") : String(v);
      return s === "" ? null : s;
    }
    case "number":
    case "currency":
    case "percent":
      return parseNumber(v);
    case "rating": {
      const n = parseNumber(v);
      if (n === null) return null;
      const max = o.max ?? 5;
      const r = Math.max(0, Math.min(max, Math.round(n)));
      return r === 0 ? null : r;
    }
    case "checkbox":
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string") return TRUE_STRINGS.has(v.trim().toLowerCase());
      return false;
    case "singleSelect": {
      const val = Array.isArray(v) ? v[0] : v;
      return findChoice(o.choices ?? [], val)?.id ?? null;
    }
    case "multiSelect": {
      const ids: string[] = [];
      for (const item of splitList(v)) {
        const c = findChoice(o.choices ?? [], item);
        if (c && !ids.includes(c.id)) ids.push(c.id);
      }
      return ids.length ? ids : null;
    }
    case "date":
      return parseDate(v, !!o.includeTime);
    case "link": {
      const ids = splitList(v).filter((x): x is string => typeof x === "string" && x.startsWith("rec"));
      const unique = [...new Set(ids)];
      return unique.length ? unique : null;
    }
    case "attachment": {
      const out: Attachment[] = [];
      for (const item of splitList(v)) {
        if (typeof item === "string" && item) {
          out.push({ url: item, name: item.split("/").pop()?.split("?")[0] || item });
        } else if (item && typeof item === "object" && typeof (item as Attachment).url === "string") {
          const a = item as Attachment;
          out.push({ url: a.url, name: typeof a.name === "string" && a.name ? a.name : a.url });
        }
      }
      return out.length ? out : null;
    }
    case "user":
      return typeof v === "string" && v ? v : null;
    default:
      return null;
  }
}

/**
 * For select fields: given raw inputs (names), return a choices list that
 * includes any missing names, or null if nothing needed to be added.
 */
export function ensureChoices(field: Pick<Field, "type" | "options">, raw: unknown[]): Choice[] | null {
  if (field.type !== "singleSelect" && field.type !== "multiSelect") return null;
  const choices = [...(field.options.choices ?? [])];
  let added = false;
  for (const value of raw) {
    const names = field.type === "multiSelect" ? splitList(value) : [Array.isArray(value) ? value[0] : value];
    for (const n of names) {
      if (typeof n !== "string" || !n.trim()) continue;
      if (findChoice(choices, n)) continue;
      choices.push({ id: newId("sel"), name: n.trim(), color: COLORS[choices.length % COLORS.length] });
      added = true;
    }
  }
  return added ? choices : null;
}

export interface DisplayContext {
  userName?: (id: string) => string | undefined;
  linkName?: (tableId: string, recordId: string) => string | undefined;
}

export function formatNumber(n: number, field: Pick<Field, "type" | "options">): string {
  const precision = field.options.precision ?? (field.type === "currency" ? 2 : undefined);
  const str =
    precision === undefined
      ? n.toLocaleString("en-US", { maximumFractionDigits: 10 })
      : n.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
  if (field.type === "currency") return `${field.options.symbol ?? "$"}${str}`;
  if (field.type === "percent") return `${str}%`;
  return str;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(value: string, includeTime: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    if (!includeTime) return `${MONTHS[m - 1]} ${d}, ${y}`;
    return `${MONTHS[m - 1]} ${d}, ${y} 12:00 AM`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  if (!includeTime) return base;
  let h = date.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${base} ${h}:${pad(date.getMinutes())} ${ampm}`;
}

/** Plain-text representation of a cell, used for search, CSV export, copy and grouping labels. */
export function cellToText(field: Field, v: unknown, ctx: DisplayContext = {}): string {
  if (v === null || v === undefined) return "";
  switch (field.type) {
    case "number":
    case "currency":
    case "percent":
      return typeof v === "number" ? formatNumber(v, field) : String(v);
    case "checkbox":
      return v ? "checked" : "";
    case "singleSelect":
      return (field.options.choices ?? []).find((c) => c.id === v)?.name ?? "";
    case "multiSelect":
      return (Array.isArray(v) ? v : [])
        .map((id) => (field.options.choices ?? []).find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ");
    case "date":
      return typeof v === "string" ? formatDate(v, !!field.options.includeTime) : "";
    case "createdTime":
    case "lastModifiedTime":
      return typeof v === "string" ? formatDate(v, true) : "";
    case "link": {
      const tableId = field.options.linkedTableId ?? "";
      return (Array.isArray(v) ? v : [])
        .map((id: string) => ctx.linkName?.(tableId, id) ?? id)
        .join(", ");
    }
    case "attachment":
      return (Array.isArray(v) ? (v as Attachment[]) : []).map((a) => a.url).join(", ");
    case "user":
    case "createdBy":
    case "lastModifiedBy":
      return typeof v === "string" ? (ctx.userName?.(v) ?? v) : "";
    case "formula":
      if (typeof v === "number") return formatNumber(v, field);
      if (typeof v === "boolean") return v ? "true" : "false";
      if (v instanceof Error) return "#ERROR";
      return String(v);
    case "rating":
      return typeof v === "number" ? String(v) : "";
    default:
      return Array.isArray(v) ? v.join(", ") : String(v);
  }
}

/** Compare two cell values for sorting. Empty values always sort last. */
export function compareValues(field: Field, a: unknown, b: unknown, ctx: DisplayContext = {}): number {
  const ea = isEmptyValue(a) && field.type !== "checkbox";
  const eb = isEmptyValue(b) && field.type !== "checkbox";
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  switch (field.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating":
      return (a as number) - (b as number);
    case "checkbox":
      return (a ? 1 : 0) - (b ? 1 : 0);
    case "date":
    case "createdTime":
    case "lastModifiedTime":
      return new Date(a as string).getTime() - new Date(b as string).getTime();
    case "singleSelect": {
      // Sort by choice order, like Airtable
      const choices = field.options.choices ?? [];
      return choices.findIndex((c) => c.id === a) - choices.findIndex((c) => c.id === b);
    }
    case "formula":
      if (typeof a === "number" && typeof b === "number") return a - b;
      break;
  }
  return cellToText(field, a, ctx).localeCompare(cellToText(field, b, ctx), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** Convert a value when a field's type changes. */
export function convertValue(from: Field, to: Pick<Field, "type" | "options">, v: unknown, ctx: DisplayContext = {}) {
  if (v === null || v === undefined) return null;
  if (from.type === to.type) return coerceValue(to, v);
  if (to.type === "link" || from.type === "link") return null;
  if (to.type === "attachment" && from.type !== "attachment") return null;
  if (to.type === "user" && from.type !== "user") return null;
  if ((to.type === "multiSelect" || to.type === "singleSelect") && (from.type === "multiSelect" || from.type === "singleSelect")) {
    // keep names; choices will be ensured separately
    return coerceValue(to, cellToText(from, v, ctx));
  }
  if (["number", "currency", "percent", "rating"].includes(from.type) && typeof v === "number") {
    return coerceValue(to, v);
  }
  return coerceValue(to, cellToText(from, v, ctx));
}
