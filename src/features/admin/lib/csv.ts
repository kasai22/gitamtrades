export type CsvColumn<T> = { header: string; value: (row: T) => string | number | boolean | null | undefined };

/** Neutralises spreadsheet formula injection: cells starting with = + - @ (or tab/CR) are prefixed with '. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  // BOM so spreadsheet apps detect UTF-8 (names may contain non-ASCII characters).
  return `﻿${lines.join("\r\n")}\r\n`;
}

export const MAX_EXPORT_ROWS = 10_000;
