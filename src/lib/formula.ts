/**
 * A small Airtable-compatible formula language.
 *
 * Field references are written {Field name} in the editor and stored as {fldXXXX}.
 * Supports arithmetic, comparisons, & concatenation, and a library of common functions.
 */

export type FValue = number | string | boolean | null | FValue[];

export class FormulaError extends Error {}

type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ref"; name: string }
  | { t: "call"; name: string; args: Node[] }
  | { t: "unary"; op: string; arg: Node }
  | { t: "bin"; op: string; left: Node; right: Node };

type Token =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "ref"; v: string }
  | { k: "ident"; v: string }
  | { k: "op"; v: string }
  | { k: "("; v: "(" }
  | { k: ")"; v: ")" }
  | { k: ","; v: "," };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.eE]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (Number.isNaN(n)) throw new FormulaError(`Invalid number "${src.slice(i, j)}"`);
      out.push({ k: "num", v: n });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const n = src[j + 1];
          s += n === "n" ? "\n" : n === "t" ? "\t" : n;
          j += 2;
        } else {
          s += src[j++];
        }
      }
      if (j >= src.length) throw new FormulaError("Unterminated string");
      out.push({ k: "str", v: s });
      i = j + 1;
      continue;
    }
    if (c === "{") {
      const j = src.indexOf("}", i);
      if (j < 0) throw new FormulaError("Missing } in field reference");
      out.push({ k: "ref", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ k: "ident", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "!=" || two === "<=" || two === ">=" || two === "<>") {
      out.push({ k: "op", v: two === "<>" ? "!=" : two });
      i += 2;
      continue;
    }
    if ("+-*/&=<>".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      out.push({ k: c, v: c } as Token);
      i++;
      continue;
    }
    throw new FormulaError(`Unexpected character "${c}"`);
  }
  return out;
}

class Parser {
  i = 0;
  constructor(private toks: Token[]) {}
  peek() {
    return this.toks[this.i];
  }
  next() {
    return this.toks[this.i++];
  }
  isOp(...ops: string[]) {
    const t = this.peek();
    return t?.k === "op" && ops.includes(t.v);
  }
  parse(): Node {
    if (this.toks.length === 0) return { t: "str", v: "" };
    const n = this.comparison();
    if (this.i < this.toks.length) throw new FormulaError(`Unexpected "${this.peek().v}"`);
    return n;
  }
  comparison(): Node {
    let left = this.concat();
    while (this.isOp("=", "!=", "<", ">", "<=", ">=")) {
      const op = this.next().v as string;
      left = { t: "bin", op, left, right: this.concat() };
    }
    return left;
  }
  concat(): Node {
    let left = this.additive();
    while (this.isOp("&")) {
      this.next();
      left = { t: "bin", op: "&", left, right: this.additive() };
    }
    return left;
  }
  additive(): Node {
    let left = this.term();
    while (this.isOp("+", "-")) {
      const op = this.next().v as string;
      left = { t: "bin", op, left, right: this.term() };
    }
    return left;
  }
  term(): Node {
    let left = this.unary();
    while (this.isOp("*", "/")) {
      const op = this.next().v as string;
      left = { t: "bin", op, left, right: this.unary() };
    }
    return left;
  }
  unary(): Node {
    if (this.isOp("-", "+")) {
      const op = this.next().v as string;
      return { t: "unary", op, arg: this.unary() };
    }
    return this.primary();
  }
  primary(): Node {
    const t = this.next();
    if (!t) throw new FormulaError("Unexpected end of formula");
    switch (t.k) {
      case "num":
        return { t: "num", v: t.v };
      case "str":
        return { t: "str", v: t.v };
      case "ref":
        return { t: "ref", name: t.v };
      case "(": {
        const n = this.comparison();
        if (this.next()?.k !== ")") throw new FormulaError("Missing )");
        return n;
      }
      case "ident": {
        const name = t.v.toUpperCase();
        if (this.peek()?.k === "(") {
          this.next();
          const args: Node[] = [];
          if (this.peek()?.k !== ")") {
            for (;;) {
              args.push(this.comparison());
              const sep = this.next();
              if (sep?.k === ")") break;
              if (sep?.k !== ",") throw new FormulaError(`Expected , or ) in ${name}()`);
            }
          } else {
            this.next();
          }
          if (!(name in FUNCTIONS)) throw new FormulaError(`Unknown function ${name}`);
          return { t: "call", name, args };
        }
        if (name === "TRUE") return { t: "bool", v: true };
        if (name === "FALSE") return { t: "bool", v: false };
        throw new FormulaError(`Unknown name "${t.v}"`);
      }
      default:
        throw new FormulaError(`Unexpected "${t.v}"`);
    }
  }
}

const cache = new Map<string, Node | FormulaError>();

export function parseFormula(src: string): Node {
  let n = cache.get(src);
  if (!n) {
    try {
      n = new Parser(tokenize(src)).parse();
    } catch (e) {
      n = e instanceof FormulaError ? e : new FormulaError(String(e));
    }
    if (cache.size > 500) cache.clear();
    cache.set(src, n);
  }
  if (n instanceof FormulaError) throw n;
  return n;
}

/** Returns an error message, or null if the formula parses. */
export function validateFormula(src: string): string | null {
  try {
    parseFormula(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function referencedFields(src: string): string[] {
  const out: string[] = [];
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/** Replace {Field name} with {fldId}. Unknown names are kept. */
export function formulaNamesToIds(src: string, fields: { id: string; name: string }[]): string {
  return src.replace(/\{([^}]*)\}/g, (all, name: string) => {
    const f = fields.find((x) => x.name === name) ?? fields.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return f ? `{${f.id}}` : all;
  });
}

/** Replace {fldId} with {Field name}. */
export function formulaIdsToNames(src: string, fields: { id: string; name: string }[]): string {
  return src.replace(/\{([^}]*)\}/g, (all, id: string) => {
    const f = fields.find((x) => x.id === id);
    return f ? `{${f.name}}` : all;
  });
}

// ---------------------------------------------------------------- evaluation

export interface EvalContext {
  /** Resolve a field reference (by id or name) to a formula value. */
  ref(name: string): FValue;
  recordId?: string;
  createdTime?: string;
  lastModifiedTime?: string;
  now?: Date;
}

function toNum(v: FValue): number {
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.reduce<number>((a, b) => a + toNum(b), 0);
  const n = Number(String(v).replace(/[,$%]/g, ""));
  if (Number.isNaN(n)) throw new FormulaError(`"${v}" is not a number`);
  return n;
}

function toStr(v: FValue): string {
  if (v === null) return "";
  if (Array.isArray(v)) return v.map(toStr).join(", ");
  return String(v);
}

function truthy(v: FValue): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v && v !== "0";
}

function toDate(v: FValue): Date | null {
  if (v === null || v === "") return null;
  if (typeof v === "number") return new Date(v);
  const s = toStr(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  if (Number.isNaN(d.getTime())) throw new FormulaError(`"${s}" is not a date`);
  return d;
}

function dateOut(d: Date): string {
  return d.toISOString();
}

const UNIT_MS: Record<string, number> = {
  milliseconds: 1,
  ms: 1,
  seconds: 1000,
  s: 1000,
  minutes: 60_000,
  m: 60_000,
  hours: 3_600_000,
  h: 3_600_000,
  days: 86_400_000,
  d: 86_400_000,
  weeks: 604_800_000,
  w: 604_800_000,
};

function normUnit(u: FValue): string {
  const s = toStr(u ?? "days").toLowerCase();
  if (s === "month" || s === "months" || s === "mo") return "months";
  if (s === "year" || s === "years" || s === "y") return "years";
  if (s === "quarter" || s === "quarters" || s === "q") return "quarters";
  if (s.length > 1 && !s.endsWith("s") && s + "s" in UNIT_MS) return s + "s";
  return s;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

function formatDateStr(d: Date, fmt: string): string {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return fmt.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a/g, (tok) => {
    const h = d.getHours();
    switch (tok) {
      case "YYYY":
        return String(d.getFullYear());
      case "YY":
        return String(d.getFullYear()).slice(-2);
      case "MMMM":
        return MONTHS[d.getMonth()];
      case "MMM":
        return MONTHS[d.getMonth()].slice(0, 3);
      case "MM":
        return pad(d.getMonth() + 1);
      case "M":
        return String(d.getMonth() + 1);
      case "DD":
        return pad(d.getDate());
      case "D":
        return String(d.getDate());
      case "dddd":
        return DAYS[d.getDay()];
      case "ddd":
        return DAYS[d.getDay()].slice(0, 3);
      case "HH":
        return pad(h);
      case "H":
        return String(h);
      case "hh":
        return pad(h % 12 || 12);
      case "h":
        return String(h % 12 || 12);
      case "mm":
        return pad(d.getMinutes());
      case "ss":
        return pad(d.getSeconds());
      case "A":
        return h >= 12 ? "PM" : "AM";
      case "a":
        return h >= 12 ? "pm" : "am";
    }
    return tok;
  });
}

function flatten(args: FValue[]): FValue[] {
  return args.flatMap((a) => (Array.isArray(a) ? flatten(a) : [a]));
}

function roundTo(n: number, p: number, mode: "round" | "up" | "down") {
  const f = Math.pow(10, p);
  const x = n * f;
  const r = mode === "round" ? Math.round(x) : mode === "up" ? Math.sign(x) * Math.ceil(Math.abs(x)) : Math.trunc(x);
  return r / f;
}

type Fn = (args: FValue[], ctx: EvalContext) => FValue;

/** Functions with lazy argument evaluation are handled separately (IF, SWITCH, AND, OR). */
const FUNCTIONS: Record<string, Fn | null> = {
  IF: null,
  SWITCH: null,
  AND: null,
  OR: null,
  IFERROR: null,
  NOT: ([a]) => !truthy(a),
  XOR: (args) => flatten(args).filter(truthy).length % 2 === 1,
  BLANK: () => null,
  ISBLANK: ([a]) => a === null || a === "" || (Array.isArray(a) && a.length === 0),
  TRUE: () => true,
  FALSE: () => false,
  SUM: (args) => flatten(args).reduce<number>((s, v) => s + toNum(v), 0),
  AVERAGE: (args) => {
    const xs = flatten(args).filter((v) => v !== null && v !== "");
    return xs.length ? xs.reduce<number>((s, v) => s + toNum(v), 0) / xs.length : 0;
  },
  MIN: (args) => {
    const xs = flatten(args).filter((v) => v !== null && v !== "").map(toNum);
    return xs.length ? Math.min(...xs) : 0;
  },
  MAX: (args) => {
    const xs = flatten(args).filter((v) => v !== null && v !== "").map(toNum);
    return xs.length ? Math.max(...xs) : 0;
  },
  COUNT: (args) => flatten(args).filter((v) => typeof v === "number").length,
  COUNTA: (args) => flatten(args).filter((v) => v !== null && v !== "").length,
  COUNTALL: (args) => flatten(args).length,
  ROUND: ([n, p]) => roundTo(toNum(n), toNum(p ?? 0), "round"),
  ROUNDUP: ([n, p]) => roundTo(toNum(n), toNum(p ?? 0), "up"),
  ROUNDDOWN: ([n, p]) => roundTo(toNum(n), toNum(p ?? 0), "down"),
  INT: ([n]) => Math.floor(toNum(n)),
  CEILING: ([n, s]) => {
    const sig = toNum(s ?? 1) || 1;
    return Math.ceil(toNum(n) / sig) * sig;
  },
  FLOOR: ([n, s]) => {
    const sig = toNum(s ?? 1) || 1;
    return Math.floor(toNum(n) / sig) * sig;
  },
  ABS: ([n]) => Math.abs(toNum(n)),
  MOD: ([a, b]) => {
    const d = toNum(b);
    if (d === 0) throw new FormulaError("Division by zero");
    return toNum(a) % d;
  },
  POWER: ([a, b]) => Math.pow(toNum(a), toNum(b)),
  SQRT: ([a]) => Math.sqrt(toNum(a)),
  EXP: ([a]) => Math.exp(toNum(a)),
  LOG: ([a, b]) => Math.log(toNum(a)) / Math.log(toNum(b ?? 10)),
  VALUE: ([a]) => toNum(a),
  CONCATENATE: (args) => args.map(toStr).join(""),
  LEN: ([a]) => toStr(a).length,
  UPPER: ([a]) => toStr(a).toUpperCase(),
  LOWER: ([a]) => toStr(a).toLowerCase(),
  TRIM: ([a]) => toStr(a).trim(),
  LEFT: ([a, n]) => toStr(a).slice(0, toNum(n ?? 1)),
  RIGHT: ([a, n]) => {
    const s = toStr(a);
    const k = toNum(n ?? 1);
    return k <= 0 ? "" : s.slice(-k);
  },
  MID: ([a, start, n]) => toStr(a).substr(toNum(start) - 1, toNum(n)),
  FIND: ([needle, hay, start]) => toStr(hay).indexOf(toStr(needle), toNum(start ?? 1) - 1) + 1,
  SEARCH: ([needle, hay, start]) => {
    const i = toStr(hay).toLowerCase().indexOf(toStr(needle).toLowerCase(), toNum(start ?? 1) - 1);
    return i < 0 ? null : i + 1;
  },
  SUBSTITUTE: ([s, old, rep]) => toStr(s).split(toStr(old)).join(toStr(rep)),
  REPT: ([s, n]) => toStr(s).repeat(Math.max(0, toNum(n))),
  T: ([a]) => (typeof a === "string" ? a : ""),
  ARRAYJOIN: ([a, sep]) => (Array.isArray(a) ? a : [a]).map(toStr).join(sep === undefined ? ", " : toStr(sep)),
  ARRAYUNIQUE: ([a]) => [...new Set(Array.isArray(a) ? a : [a])],
  ARRAYCOMPACT: ([a]) => (Array.isArray(a) ? a : [a]).filter((v) => v !== null && v !== ""),
  TODAY: (_a, ctx) => {
    const d = ctx.now ?? new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  NOW: (_a, ctx) => dateOut(ctx.now ?? new Date()),
  YEAR: ([d]) => toDate(d)?.getFullYear() ?? null,
  MONTH: ([d]) => (toDate(d)?.getMonth() ?? -1) + 1 || null,
  DAY: ([d]) => toDate(d)?.getDate() ?? null,
  WEEKDAY: ([d]) => toDate(d)?.getDay() ?? null,
  HOUR: ([d]) => toDate(d)?.getHours() ?? null,
  MINUTE: ([d]) => toDate(d)?.getMinutes() ?? null,
  DATETIME_PARSE: ([s]) => {
    const d = toDate(s);
    return d ? dateOut(d) : null;
  },
  DATETIME_FORMAT: ([d, fmt]) => {
    const date = toDate(d);
    return date ? formatDateStr(date, fmt === undefined ? "YYYY-MM-DD" : toStr(fmt)) : null;
  },
  DATETIME_DIFF: ([a, b, unit]) => {
    const d1 = toDate(a);
    const d2 = toDate(b);
    if (!d1 || !d2) return null;
    const u = normUnit(unit ?? "seconds");
    if (u === "months" || u === "years" || u === "quarters") {
      const months = (d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth());
      return u === "months" ? months : u === "quarters" ? Math.trunc(months / 3) : Math.trunc(months / 12);
    }
    const ms = UNIT_MS[u];
    if (!ms) throw new FormulaError(`Unknown unit "${toStr(unit)}"`);
    return Math.trunc((d1.getTime() - d2.getTime()) / ms);
  },
  DATEADD: ([d, n, unit]) => {
    const date = toDate(d);
    if (!date) return null;
    const count = toNum(n);
    const u = normUnit(unit ?? "days");
    if (u === "months") return dateOut(addMonths(date, count));
    if (u === "quarters") return dateOut(addMonths(date, count * 3));
    if (u === "years") return dateOut(addMonths(date, count * 12));
    const ms = UNIT_MS[u];
    if (!ms) throw new FormulaError(`Unknown unit "${toStr(unit)}"`);
    return dateOut(new Date(date.getTime() + count * ms));
  },
  IS_BEFORE: ([a, b]) => (toDate(a)?.getTime() ?? 0) < (toDate(b)?.getTime() ?? 0),
  IS_AFTER: ([a, b]) => (toDate(a)?.getTime() ?? 0) > (toDate(b)?.getTime() ?? 0),
  IS_SAME: ([a, b]) => toDate(a)?.getTime() === toDate(b)?.getTime(),
  RECORD_ID: (_a, ctx) => ctx.recordId ?? null,
  CREATED_TIME: (_a, ctx) => ctx.createdTime ?? null,
  LAST_MODIFIED_TIME: (_a, ctx) => ctx.lastModifiedTime ?? null,
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort();

function equals(a: FValue, b: FValue): boolean {
  if (typeof a === "number" || typeof b === "number") {
    if ((a === null || a === "") && (b === null || b === "")) return true;
    try {
      return toNum(a) === toNum(b);
    } catch {
      return false;
    }
  }
  if (typeof a === "boolean" || typeof b === "boolean") return truthy(a) === truthy(b);
  return toStr(a) === toStr(b);
}

function compare(a: FValue, b: FValue): number {
  if (typeof a === "number" || typeof b === "number") return toNum(a) - toNum(b);
  const da = typeof a === "string" ? Date.parse(a) : NaN;
  const db = typeof b === "string" ? Date.parse(b) : NaN;
  if (!Number.isNaN(da) && !Number.isNaN(db) && /\d{4}-\d{2}/.test(String(a))) return da - db;
  return toStr(a).localeCompare(toStr(b));
}

function evalNode(n: Node, ctx: EvalContext): FValue {
  switch (n.t) {
    case "num":
    case "str":
    case "bool":
      return n.v;
    case "ref":
      return ctx.ref(n.name);
    case "unary": {
      const v = toNum(evalNode(n.arg, ctx));
      return n.op === "-" ? -v : v;
    }
    case "bin": {
      const l = evalNode(n.left, ctx);
      const r = evalNode(n.right, ctx);
      switch (n.op) {
        case "+":
          return toNum(l) + toNum(r);
        case "-":
          return toNum(l) - toNum(r);
        case "*":
          return toNum(l) * toNum(r);
        case "/": {
          const d = toNum(r);
          if (d === 0) throw new FormulaError("Division by zero");
          return toNum(l) / d;
        }
        case "&":
          return toStr(l) + toStr(r);
        case "=":
          return equals(l, r);
        case "!=":
          return !equals(l, r);
        case "<":
          return compare(l, r) < 0;
        case ">":
          return compare(l, r) > 0;
        case "<=":
          return compare(l, r) <= 0;
        case ">=":
          return compare(l, r) >= 0;
      }
      throw new FormulaError(`Unknown operator ${n.op}`);
    }
    case "call": {
      const a = n.args;
      switch (n.name) {
        case "IF":
          if (a.length < 2) throw new FormulaError("IF() needs at least 2 arguments");
          return truthy(evalNode(a[0], ctx)) ? evalNode(a[1], ctx) : a[2] ? evalNode(a[2], ctx) : null;
        case "AND":
          return a.every((x) => truthy(evalNode(x, ctx)));
        case "OR":
          return a.some((x) => truthy(evalNode(x, ctx)));
        case "IFERROR":
          try {
            return evalNode(a[0], ctx);
          } catch {
            return a[1] ? evalNode(a[1], ctx) : null;
          }
        case "SWITCH": {
          const v = evalNode(a[0], ctx);
          let i = 1;
          for (; i + 1 < a.length; i += 2) {
            if (equals(v, evalNode(a[i], ctx))) return evalNode(a[i + 1], ctx);
          }
          return i < a.length ? evalNode(a[i], ctx) : null;
        }
      }
      const fn = FUNCTIONS[n.name];
      if (!fn) throw new FormulaError(`Unknown function ${n.name}`);
      return fn(
        a.map((x) => evalNode(x, ctx)),
        ctx,
      );
    }
  }
}

export function evaluateFormula(src: string, ctx: EvalContext): FValue {
  const ast = parseFormula(src);
  const v = evalNode(ast, ctx);
  if (typeof v === "number" && !Number.isFinite(v)) throw new FormulaError("Result is not a finite number");
  return v;
}
