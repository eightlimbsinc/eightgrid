import type { CellGetter } from "./compute";
import { compareValues, isEmptyValue, parseDate } from "./fields";
import type { Field, FieldType, FilterCondition, FilterOp, FilterSet, RecordRow, SortSpec, View } from "./types";

export interface OpInfo {
  op: FilterOp;
  label: string;
  /** does this operator take a value? */
  valueless?: boolean;
}

const TEXT_OPS: OpInfo[] = [
  { op: "contains", label: "contains" },
  { op: "notContains", label: "does not contain" },
  { op: "is", label: "is" },
  { op: "isNot", label: "is not" },
  { op: "isEmpty", label: "is empty", valueless: true },
  { op: "isNotEmpty", label: "is not empty", valueless: true },
];
const NUM_OPS: OpInfo[] = [
  { op: "is", label: "=" },
  { op: "isNot", label: "≠" },
  { op: "lt", label: "<" },
  { op: "lte", label: "≤" },
  { op: "gt", label: ">" },
  { op: "gte", label: "≥" },
  { op: "isEmpty", label: "is empty", valueless: true },
  { op: "isNotEmpty", label: "is not empty", valueless: true },
];
const DATE_OPS: OpInfo[] = [
  { op: "is", label: "is" },
  { op: "isBefore", label: "is before" },
  { op: "isAfter", label: "is after" },
  { op: "isEmpty", label: "is empty", valueless: true },
  { op: "isNotEmpty", label: "is not empty", valueless: true },
];

export function opsForType(type: FieldType): OpInfo[] {
  switch (type) {
    case "number":
    case "currency":
    case "percent":
    case "rating":
      return NUM_OPS;
    case "date":
    case "createdTime":
    case "lastModifiedTime":
      return DATE_OPS;
    case "checkbox":
      return [{ op: "is", label: "is" }];
    case "singleSelect":
      return [
        { op: "is", label: "is" },
        { op: "isNot", label: "is not" },
        { op: "isAnyOf", label: "is any of" },
        { op: "isNoneOf", label: "is none of" },
        { op: "isEmpty", label: "is empty", valueless: true },
        { op: "isNotEmpty", label: "is not empty", valueless: true },
      ];
    case "multiSelect":
      return [
        { op: "hasAnyOf", label: "has any of" },
        { op: "hasAllOf", label: "has all of" },
        { op: "isNoneOf", label: "has none of" },
        { op: "isEmpty", label: "is empty", valueless: true },
        { op: "isNotEmpty", label: "is not empty", valueless: true },
      ];
    case "user":
    case "createdBy":
    case "lastModifiedBy":
      return [
        { op: "is", label: "is" },
        { op: "isNot", label: "is not" },
        { op: "isEmpty", label: "is empty", valueless: true },
        { op: "isNotEmpty", label: "is not empty", valueless: true },
      ];
    case "attachment":
      return [
        { op: "isEmpty", label: "is empty", valueless: true },
        { op: "isNotEmpty", label: "is not empty", valueless: true },
      ];
    default:
      return TEXT_OPS;
  }
}

export function defaultOp(type: FieldType): FilterOp {
  return opsForType(type)[0].op;
}

function dayKey(v: unknown): string | null {
  const d = parseDate(v, false);
  return d;
}

function matches(cond: FilterCondition, field: Field, record: RecordRow, getter: CellGetter): boolean {
  const raw = getter.get(record, field);
  const value = raw instanceof Error ? null : raw;
  const cv = cond.value;
  const noValue = cv === undefined || cv === null || cv === "" || (Array.isArray(cv) && cv.length === 0);
  switch (cond.op) {
    case "isEmpty":
      return field.type === "formula" ? getter.text(record, field) === "" : isEmptyValue(value);
    case "isNotEmpty":
      return field.type === "formula" ? getter.text(record, field) !== "" : !isEmptyValue(value);
  }
  if (field.type === "checkbox") return !!value === !!cv;
  // Incomplete conditions don't filter anything out, like Airtable
  if (noValue) return true;

  switch (field.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating": {
      const target = Number(cv);
      if (Number.isNaN(target)) return true;
      if (typeof value !== "number") return cond.op === "isNot";
      switch (cond.op) {
        case "is":
          return value === target;
        case "isNot":
          return value !== target;
        case "lt":
          return value < target;
        case "lte":
          return value <= target;
        case "gt":
          return value > target;
        case "gte":
          return value >= target;
      }
      return true;
    }
    case "date":
    case "createdTime":
    case "lastModifiedTime": {
      const a = dayKey(value);
      const b = dayKey(cv);
      if (!b) return true;
      if (!a) return false;
      if (cond.op === "is") return a === b;
      if (cond.op === "isBefore") return a < b;
      if (cond.op === "isAfter") return a > b;
      return true;
    }
    case "singleSelect":
    case "user":
    case "createdBy":
    case "lastModifiedBy": {
      const list = Array.isArray(cv) ? (cv as string[]) : [String(cv)];
      switch (cond.op) {
        case "is":
          return value === list[0];
        case "isNot":
          return value !== list[0];
        case "isAnyOf":
          return list.includes(value as string);
        case "isNoneOf":
          return !list.includes(value as string);
      }
      return true;
    }
    case "multiSelect": {
      const list = Array.isArray(cv) ? (cv as string[]) : [String(cv)];
      const have = Array.isArray(value) ? (value as string[]) : [];
      switch (cond.op) {
        case "hasAnyOf":
          return list.some((x) => have.includes(x));
        case "hasAllOf":
          return list.every((x) => have.includes(x));
        case "isNoneOf":
          return !list.some((x) => have.includes(x));
      }
      return true;
    }
  }
  const text = getter.text(record, field).toLowerCase();
  const needle = String(cv).toLowerCase();
  switch (cond.op) {
    case "contains":
      return text.includes(needle);
    case "notContains":
      return !text.includes(needle);
    case "is":
      return text === needle;
    case "isNot":
      return text !== needle;
  }
  return true;
}

export function applyFilters(records: RecordRow[], filters: FilterSet | undefined, getter: CellGetter): RecordRow[] {
  const conds = (filters?.conditions ?? []).filter((c) => getter.field(c.fieldId));
  if (!conds.length) return records;
  const and = filters?.conjunction !== "or";
  return records.filter((r) => {
    const results = conds.map((c) => matches(c, getter.field(c.fieldId)!, r, getter));
    return and ? results.every(Boolean) : results.some(Boolean);
  });
}

export function applySorts(records: RecordRow[], sorts: SortSpec[] | undefined, getter: CellGetter): RecordRow[] {
  const valid = (sorts ?? []).filter((s) => getter.field(s.fieldId));
  const out = [...records];
  out.sort((a, b) => {
    for (const s of valid) {
      const f = getter.field(s.fieldId)!;
      const va = getter.get(a, f);
      const vb = getter.get(b, f);
      let c = compareValues(f, va instanceof Error ? null : va, vb instanceof Error ? null : vb, getter.ctx);
      // keep empties last regardless of direction
      const ea = isEmptyValue(va) && f.type !== "checkbox";
      const eb = isEmptyValue(vb) && f.type !== "checkbox";
      if (!(ea || eb) && s.direction === "desc") c = -c;
      if (c !== 0) return c;
    }
    return a.position - b.position;
  });
  return out;
}

export function searchRecords(records: RecordRow[], fields: Field[], term: string, getter: CellGetter): RecordRow[] {
  const t = term.trim().toLowerCase();
  if (!t) return records;
  return records.filter((r) => fields.some((f) => getter.text(r, f).toLowerCase().includes(t)));
}

export interface GroupNode {
  key: string;
  label: string;
  fieldId: string;
  /** Raw cell value shared by the group, used to prefill new records. */
  value: unknown;
  depth: number;
  records: RecordRow[];
  children?: GroupNode[];
}

/** Group sorted records. Records must already be sorted; group order follows the group spec. */
export function groupRecords(records: RecordRow[], groups: SortSpec[], getter: CellGetter, depth = 0, prefix = ""): GroupNode[] {
  const spec = groups[depth];
  const field = spec && getter.field(spec.fieldId);
  if (!spec || !field) return [];
  const sorted = applySorts(records, [spec], getter);
  const nodes: GroupNode[] = [];
  const byKey = new Map<string, GroupNode>();
  for (const r of sorted) {
    let raw = getter.get(r, field);
    if (raw instanceof Error) raw = null;
    const label = getter.text(r, field);
    const key = `${prefix}/${field.type === "checkbox" ? String(!!raw) : label}`;
    let node = byKey.get(key);
    if (!node) {
      node = { key, label, fieldId: field.id, value: raw, depth, records: [] };
      byKey.set(key, node);
      nodes.push(node);
    }
    node.records.push(r);
  }
  if (depth + 1 < groups.length) {
    for (const n of nodes) n.children = groupRecords(n.records, groups, getter, depth + 1, n.key);
  }
  return nodes;
}

/** Fields shown in a view, in view order, with the primary field always first. */
export function orderedFields(fields: Field[], view: Pick<View, "config"> | undefined, primaryFieldId: string): Field[] {
  const order = view?.config.fieldOrder ?? [];
  const rank = new Map(order.map((id, i) => [id, i]));
  const sorted = [...fields].sort((a, b) => {
    if (a.id === primaryFieldId) return -1;
    if (b.id === primaryFieldId) return 1;
    const ra = rank.get(a.id) ?? 10_000 + a.position;
    const rb = rank.get(b.id) ?? 10_000 + b.position;
    return ra - rb;
  });
  return sorted;
}

export function visibleFields(fields: Field[], view: Pick<View, "config"> | undefined, primaryFieldId: string): Field[] {
  const hidden = new Set(view?.config.hiddenFieldIds ?? []);
  return orderedFields(fields, view, primaryFieldId).filter((f) => f.id === primaryFieldId || !hidden.has(f.id));
}

/** Apply a view's filters and sorts to a set of records. */
export function viewRecords(records: RecordRow[], view: Pick<View, "config"> | undefined, getter: CellGetter): RecordRow[] {
  const filtered = applyFilters(records, view?.config.filters, getter);
  const sorts = [...(view?.config.groups ?? []), ...(view?.config.sorts ?? [])];
  return sorts.length ? applySorts(filtered, sorts, getter) : [...filtered].sort((a, b) => a.position - b.position);
}
