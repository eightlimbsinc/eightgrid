import type { FieldType } from "./types";

/** Guess a field type from sample string values (used by CSV import). */
export function guessFieldType(values: string[]): FieldType {
  const vals = values.map((v) => v.trim()).filter(Boolean);
  if (!vals.length) return "text";
  const all = (re: RegExp) => vals.every((v) => re.test(v));
  if (all(/^(true|false|yes|no|checked|unchecked|x|)$/i) && vals.some((v) => /^(true|yes|checked|x)$/i.test(v))) return "checkbox";
  if (all(/^-?\$\s?-?[\d,]+(\.\d+)?$/)) return "currency";
  if (all(/^-?[\d,]*\.?\d+%$/)) return "percent";
  if (all(/^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/)) return "number";
  if (all(/^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/)) return "date";
  if (all(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/)) return "date";
  if (all(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) return "email";
  if (all(/^https?:\/\/\S+$/)) return "url";
  if (vals.some((v) => v.includes("\n") || v.length > 120)) return "longText";
  const distinct = new Set(vals);
  if (vals.length >= 6 && distinct.size <= Math.min(12, Math.ceil(vals.length / 3))) return "singleSelect";
  return "text";
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = cell ?? "";
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
