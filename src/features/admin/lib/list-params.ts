/**
 * Parses list query strings (page, page size, sort, direction, search and allow-listed filters) for
 * admin pages and the admin API. Anything outside the allow-lists falls back to the default, so a
 * crafted URL can't reach an unexpected sort column or filter value.
 */
export type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

export const PAGE_SIZES = [10, 25, 50, 100] as const;

function read(raw: RawParams, key: string): string | undefined {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? undefined;
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

export function pickString(raw: RawParams, key: string, maxLength = 80): string {
  return (read(raw, key) ?? "").trim().slice(0, maxLength);
}

export function pickEnum<T extends string>(raw: RawParams, key: string, allowed: readonly T[], fallback: T): T {
  const value = read(raw, key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function pickOptionalEnum<T extends string>(raw: RawParams, key: string, allowed: readonly T[]): T | undefined {
  const value = read(raw, key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function pickInt(raw: RawParams, key: string, min: number, max: number): number | undefined {
  const value = Number(read(raw, key));
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

export function pickUuid(raw: RawParams, key: string): string | undefined {
  const value = read(raw, key);
  return value && UUID.test(value) ? value.toLowerCase() : undefined;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListParams<S extends string> = {
  page: number;
  pageSize: number;
  sort: S;
  dir: "asc" | "desc";
  q: string;
  offset: number;
};

export function parseListParams<S extends string>(
  raw: RawParams,
  options: { sorts: readonly S[]; defaultSort: S; defaultDir?: "asc" | "desc"; defaultPageSize?: number },
): ListParams<S> {
  const pageSize = pickInt(raw, "pageSize", 1, 100);
  const size = pageSize && (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : (options.defaultPageSize ?? 25);
  const page = pickInt(raw, "page", 1, 10_000) ?? 1;
  return {
    page,
    pageSize: size,
    sort: pickEnum(raw, "sort", options.sorts, options.defaultSort),
    dir: pickEnum(raw, "dir", ["asc", "desc"] as const, options.defaultDir ?? "desc"),
    q: pickString(raw, "q"),
    offset: (page - 1) * size,
  };
}

/** Builds a URL for the same list with some parameters changed (empty values are dropped; page resets unless set). */
export function hrefWith(base: string, current: Record<string, string | number | undefined>, overrides: Record<string, string | number | undefined>) {
  const merged: Record<string, string | number | undefined> = { ...current, page: undefined, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "" || (key === "page" && Number(value) === 1)) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
