import { cellToText, type DisplayContext } from "./fields";
import { evaluateFormula, FormulaError, type FValue } from "./formula";
import type { Field, RecordRow } from "./types";

export interface CellContext extends DisplayContext {
  fields: Field[];
}

export class CellGetter {
  private byId = new Map<string, Field>();
  private byName = new Map<string, Field>();
  private memo = new WeakMap<RecordRow, Map<string, unknown>>();

  constructor(public ctx: CellContext) {
    for (const f of ctx.fields) {
      this.byId.set(f.id, f);
      this.byName.set(f.name.toLowerCase(), f);
    }
  }

  field(id: string) {
    return this.byId.get(id);
  }

  /** Stored or computed value for a cell. Formula errors are returned as FormulaError instances. */
  get(record: RecordRow, field: Field): unknown {
    switch (field.type) {
      case "createdTime":
        return record.createdAt;
      case "lastModifiedTime":
        return record.updatedAt;
      case "createdBy":
        return record.createdBy;
      case "lastModifiedBy":
        return record.updatedBy;
      case "formula":
        return this.formula(record, field, new Set());
      default:
        return record.data[field.id] ?? null;
    }
  }

  text(record: RecordRow, field: Field): string {
    return cellToText(field, this.get(record, field), this.ctx);
  }

  private formula(record: RecordRow, field: Field, visiting: Set<string>): unknown {
    let m = this.memo.get(record);
    if (!m) this.memo.set(record, (m = new Map()));
    if (m.has(field.id)) return m.get(field.id);
    if (visiting.has(field.id)) return new FormulaError("Circular reference");
    visiting.add(field.id);
    let result: unknown;
    try {
      result = evaluateFormula(field.options.formula ?? "", {
        ref: (name) => {
          const f = this.byId.get(name) ?? this.byName.get(name.toLowerCase());
          if (!f) throw new FormulaError(`Unknown field {${name}}`);
          const v = f.type === "formula" ? this.formula(record, f, visiting) : this.get(record, f);
          if (v instanceof Error) throw v;
          return this.toFormulaValue(f, v);
        },
        recordId: record.id,
        createdTime: record.createdAt,
        lastModifiedTime: record.updatedAt,
      });
    } catch (e) {
      result = e instanceof FormulaError ? e : new FormulaError(String(e));
    }
    visiting.delete(field.id);
    m.set(field.id, result);
    return result;
  }

  private toFormulaValue(f: Field, v: unknown): FValue {
    if (v === null || v === undefined) return null;
    switch (f.type) {
      case "number":
      case "currency":
      case "percent":
      case "rating":
        return typeof v === "number" ? v : null;
      case "checkbox":
        return !!v;
      case "formula":
        return v as FValue;
      case "multiSelect":
      case "link":
        return cellToText(f, v, this.ctx)
          .split(", ")
          .filter(Boolean);
      case "date":
      case "createdTime":
      case "lastModifiedTime":
      case "text":
      case "longText":
      case "email":
      case "url":
      case "phone":
        return String(v);
      default:
        return cellToText(f, v, this.ctx);
    }
  }
}
