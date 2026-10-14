import { describe, expect, it } from "vitest";
import { CellGetter } from "./compute";
import { applyFilters, applySorts, groupRecords, searchRecords } from "./query";
import type { Field, RecordRow } from "./types";

const fields: Field[] = [
  { id: "name", tableId: "t", name: "Name", type: "text", options: {}, description: "", position: 0 },
  { id: "n", tableId: "t", name: "N", type: "number", options: {}, description: "", position: 1 },
  {
    id: "s",
    tableId: "t",
    name: "Status",
    type: "singleSelect",
    options: { choices: [{ id: "a", name: "Todo", color: "red" }, { id: "b", name: "Done", color: "green" }] },
    description: "",
    position: 2,
  },
  { id: "f", tableId: "t", name: "Double", type: "formula", options: { formula: "{n} * 2" }, description: "", position: 3 },
];
const rec = (id: string, data: Record<string, unknown>, position: number): RecordRow => ({
  id, tableId: "t", data, position, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", createdBy: null, updatedBy: null,
});
const rows = [rec("r1", { name: "Apple", n: 3, s: "b" }, 1), rec("r2", { name: "Banana", n: 1, s: "a" }, 2), rec("r3", { name: "Cherry" }, 3)];
const g = () => new CellGetter({ fields });

describe("query", () => {
  it("filters with and/or", () => {
    const and = applyFilters(rows, { conjunction: "and", conditions: [{ id: "1", fieldId: "n", op: "gt", value: 0 }, { id: "2", fieldId: "s", op: "is", value: "a" }] }, g());
    expect(and.map((r) => r.id)).toEqual(["r2"]);
    const or = applyFilters(rows, { conjunction: "or", conditions: [{ id: "1", fieldId: "name", op: "contains", value: "err" }, { id: "2", fieldId: "s", op: "is", value: "b" }] }, g());
    expect(or.map((r) => r.id)).toEqual(["r1", "r3"]);
    const empty = applyFilters(rows, { conjunction: "and", conditions: [{ id: "1", fieldId: "n", op: "isEmpty" }] }, g());
    expect(empty.map((r) => r.id)).toEqual(["r3"]);
  });
  it("ignores incomplete conditions", () => {
    expect(applyFilters(rows, { conjunction: "and", conditions: [{ id: "1", fieldId: "name", op: "contains", value: "" }] }, g())).toHaveLength(3);
  });
  it("filters on formulas", () => {
    const r = applyFilters(rows, { conjunction: "and", conditions: [{ id: "1", fieldId: "f", op: "gte", value: 6 }] }, g());
    expect(r.map((x) => x.id)).toEqual(["r1"]);
  });
  it("sorts with empties last in both directions", () => {
    expect(applySorts(rows, [{ fieldId: "n", direction: "asc" }], g()).map((r) => r.id)).toEqual(["r2", "r1", "r3"]);
    expect(applySorts(rows, [{ fieldId: "n", direction: "desc" }], g()).map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });
  it("groups", () => {
    const groups = groupRecords(rows, [{ fieldId: "s", direction: "asc" }], g());
    expect(groups.map((x) => [x.label, x.records.length])).toEqual([["Todo", 1], ["Done", 1], ["", 1]]);
  });
  it("searches across fields", () => {
    expect(searchRecords(rows, fields, "done", g()).map((r) => r.id)).toEqual(["r1"]);
  });
});
