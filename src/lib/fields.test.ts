import { describe, expect, it } from "vitest";
import { cellToText, coerceValue, compareValues, convertValue, ensureChoices } from "./fields";
import type { Field } from "./types";

const f = (type: Field["type"], options: Field["options"] = {}): Field => ({ id: "fld1", tableId: "t", name: "F", type, options, description: "", position: 0 });
const select = f("singleSelect", { choices: [{ id: "selA", name: "Todo", color: "red" }, { id: "selB", name: "Done", color: "green" }] });

describe("coerceValue", () => {
  it("parses numbers", () => {
    expect(coerceValue(f("number"), "1,234.5")).toBe(1234.5);
    expect(coerceValue(f("currency"), "$99")).toBe(99);
    expect(coerceValue(f("number"), "abc")).toBeNull();
    expect(coerceValue(f("number"), "")).toBeNull();
  });
  it("parses checkboxes", () => {
    expect(coerceValue(f("checkbox"), "yes")).toBe(true);
    expect(coerceValue(f("checkbox"), "no")).toBe(false);
  });
  it("maps select names and ids", () => {
    expect(coerceValue(select, "done")).toBe("selB");
    expect(coerceValue(select, "selA")).toBe("selA");
    expect(coerceValue(select, "missing")).toBeNull();
    const multi = { ...select, type: "multiSelect" as const };
    expect(coerceValue(multi, "Todo, Done")).toEqual(["selA", "selB"]);
  });
  it("parses dates", () => {
    expect(coerceValue(f("date"), "2026-03-01")).toBe("2026-03-01");
    expect(coerceValue(f("date"), "3/1/2026")).toBe("2026-03-01");
    expect(coerceValue(f("date"), "garbage")).toBeNull();
  });
  it("clamps ratings and filters links", () => {
    expect(coerceValue(f("rating", { max: 5 }), 9)).toBe(5);
    expect(coerceValue(f("link"), ["recA", "bogus", "recA"])).toEqual(["recA"]);
  });
  it("strips newlines from single line text", () => {
    expect(coerceValue(f("text"), "a\nb")).toBe("a b");
    expect(coerceValue(f("longText"), "a\nb")).toBe("a\nb");
  });
});

describe("display & sort", () => {
  it("formats", () => {
    expect(cellToText(f("currency", { precision: 2, symbol: "€" }), 1200)).toBe("€1,200.00");
    expect(cellToText(f("percent", { precision: 0 }), 50)).toBe("50%");
    expect(cellToText(select, "selB")).toBe("Done");
    expect(cellToText(f("date"), "2026-03-01")).toBe("Mar 1, 2026");
  });
  it("sorts empties last and selects by choice order", () => {
    expect(compareValues(f("number"), null, 1)).toBeGreaterThan(0);
    expect(compareValues(select, "selA", "selB")).toBeLessThan(0);
    expect(compareValues(f("text"), "item 2", "item 10")).toBeLessThan(0);
  });
  it("creates missing choices and converts types", () => {
    const choices = ensureChoices(select, ["Todo", "Blocked"]);
    expect(choices?.map((c) => c.name)).toEqual(["Todo", "Done", "Blocked"]);
    expect(convertValue(f("text"), f("number"), "42")).toBe(42);
    expect(convertValue(select, f("text"), "selA")).toBe("Todo");
  });
});
