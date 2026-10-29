import type { RawParams } from "./list-params";

/** Analytics day boundaries are local calendar days at the university (single-campus pilot). */
export const ADMIN_TIME_ZONE = "Asia/Kolkata";

export const RANGE_PRESETS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "365d", label: "Last 12 months", days: 365 },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["value"] | "custom";

export type DateRange = { from: string; to: string; preset: RangePreset; days: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

/** Today's date (YYYY-MM-DD) in the admin time zone. */
export function todayInZone(now = new Date(), timeZone = ADMIN_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

/** `range=7d|30d|90d|365d` or `from`/`to` (custom, ≤ 366 days, not in the future). Defaults to 30 days. */
export function parseDateRange(raw: RawParams, now = new Date(), fallback: RangePreset = "30d"): DateRange {
  const get = (key: string) => (raw instanceof URLSearchParams ? (raw.get(key) ?? undefined) : [raw[key]].flat()[0]);
  const today = todayInZone(now);
  const from = get("from");
  const to = get("to");
  if (validDate(from) && validDate(to)) {
    const end = to > today ? today : to;
    const start = from > end ? end : from;
    const clampedStart = daysBetween(start, end) > MAX_DAYS ? shift(end, -(MAX_DAYS - 1)) : start;
    return { from: clampedStart, to: end, preset: "custom", days: daysBetween(clampedStart, end) };
  }
  const preset = RANGE_PRESETS.find((p) => p.value === get("range")) ?? RANGE_PRESETS.find((p) => p.value === fallback)!;
  return { from: shift(today, -(preset.days - 1)), to: today, preset: preset.value, days: preset.days };
}
