import { describe, expect, it } from "vitest";
import { evaluateFormula, formulaIdsToNames, formulaNamesToIds, validateFormula } from "./formula";

const ev = (src: string, vals: Record<string, unknown> = {}) =>
  evaluateFormula(src, { ref: (n) => (vals[n] ?? null) as never, now: new Date("2026-03-15T10:00:00") });

describe("formula", () => {
  it("does arithmetic with precedence", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("-2 + 5")).toBe(3);
    expect(ev("10 / 4")).toBe(2.5);
  });
  it("concatenates and compares", () => {
    expect(ev('"a" & 1 & "b"')).toBe("a1b");
    expect(ev("{x} > 5", { x: 6 })).toBe(true);
    expect(ev('{s} = "hi"', { s: "hi" })).toBe(true);
    expect(ev("{s} != 3", { s: 4 })).toBe(true);
  });
  it("supports IF/AND/OR/SWITCH", () => {
    expect(ev('IF({n} > 100, "big", "small")', { n: 101 })).toBe("big");
    expect(ev("AND(1, 0)")).toBe(false);
    expect(ev("OR(0, {x})", { x: true })).toBe(true);
    expect(ev('SWITCH({s}, "a", 1, "b", 2, 0)', { s: "b" })).toBe(2);
    expect(ev('SWITCH({s}, "a", 1, 0)', { s: "z" })).toBe(0);
  });
  it("handles text functions", () => {
    expect(ev('UPPER("abc")')).toBe("ABC");
    expect(ev('LEN("hello")')).toBe(5);
    expect(ev('LEFT("hello", 2) & RIGHT("hello", 2)')).toBe("helo");
    expect(ev('SUBSTITUTE("a-b-c", "-", "+")')).toBe("a+b+c");
    expect(ev('FIND("l", "hello")')).toBe(3);
  });
  it("handles numbers", () => {
    expect(ev("ROUND(3.14159, 2)")).toBe(3.14);
    expect(ev("SUM(1, 2, 3)")).toBe(6);
    expect(ev("MAX(1, 9, 3)")).toBe(9);
    expect(ev("MOD(7, 3)")).toBe(1);
  });
  it("handles dates", () => {
    expect(ev("DATETIME_DIFF({a}, {b}, 'days')", { a: "2026-01-10", b: "2026-01-01" })).toBe(9);
    expect(ev("DATETIME_FORMAT({d}, 'YYYY/MM/DD')", { d: "2026-02-03" })).toBe("2026/02/03");
    expect(ev("TODAY()")).toBe("2026-03-15");
    expect(ev("YEAR({d})", { d: "2024-07-01" })).toBe(2024);
    expect(String(ev("DATEADD({d}, 1, 'months')", { d: "2026-01-15" }))).toContain("2026-02-15");
  });
  it("reports errors", () => {
    expect(validateFormula("1 +")).not.toBeNull();
    expect(validateFormula("NOPE(1)")).toMatch(/Unknown function/);
    expect(validateFormula('"unterminated')).toMatch(/Unterminated/);
    expect(() => ev("1 / 0")).toThrow(/Division by zero/);
    expect(validateFormula("")).toBeNull();
  });
  it("converts names and ids", () => {
    const fields = [
      { id: "fld1", name: "Price" },
      { id: "fld2", name: "Qty" },
    ];
    const stored = formulaNamesToIds("{Price} * {qty}", fields);
    expect(stored).toBe("{fld1} * {fld2}");
    expect(formulaIdsToNames(stored, fields)).toBe("{Price} * {Qty}");
  });
});
