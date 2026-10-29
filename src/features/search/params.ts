import type { ItemCondition } from "@/features/listings/constants";
import { MAX_PRICE_INR } from "@/features/listings/constants";

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "relevance", label: "Best match" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

const CONDITION_VALUES: ItemCondition[] = ["new", "like_new", "good", "fair", "for_parts"];
const SORT_VALUES = SORT_OPTIONS.map((o) => o.value) as SortOption[];

export type SearchFilters = {
  q: string;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  conditions: ItemCondition[];
  includeOnHold: boolean;
  freeOnly: boolean;
  sort: SortOption;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const all = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value : value ? [value] : []).flatMap((v) => v.split(","));

function parsePrice(value: string | undefined): number | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Math.min(Number.parseInt(digits, 10), MAX_PRICE_INR);
}

/**
 * Parses untrusted URL search params into safe, normalised filters. Never throws; anything
 * unrecognised falls back to defaults so shared links can't break the page.
 */
export function parseSearchParams(params: RawParams, fixedCategory?: string): SearchFilters {
  const q = (first(params.q) ?? "").trim().slice(0, 100);
  const categoryRaw = fixedCategory ?? first(params.category) ?? null;
  const category = categoryRaw && /^[a-z0-9-]{2,40}$/.test(categoryRaw) ? categoryRaw : null;
  const freeOnly = first(params.free) === "1";
  let minPrice = freeOnly ? null : parsePrice(first(params.min));
  let maxPrice = freeOnly ? 0 : parsePrice(first(params.max));
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const conditions = [...new Set(all(params.condition).filter((c): c is ItemCondition => CONDITION_VALUES.includes(c as ItemCondition)))];
  const sortRaw = first(params.sort) as SortOption | undefined;
  const sort: SortOption = sortRaw && SORT_VALUES.includes(sortRaw) ? sortRaw : q ? "relevance" : "newest";
  const pageRaw = Number.parseInt(first(params.page) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 500) : 1;
  return { q, category, minPrice, maxPrice, conditions, includeOnHold: first(params.hold) === "1", freeOnly, sort, page };
}

/** Serialises filters back to a query string (defaults omitted) for shareable URLs. */
export function toQueryString(filters: Partial<SearchFilters>, options: { omitCategory?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category && !options.omitCategory) params.set("category", filters.category);
  if (filters.freeOnly) params.set("free", "1");
  else {
    if (filters.minPrice != null) params.set("min", String(filters.minPrice));
    if (filters.maxPrice != null) params.set("max", String(filters.maxPrice));
  }
  if (filters.conditions?.length) params.set("condition", filters.conditions.join(","));
  if (filters.includeOnHold) params.set("hold", "1");
  if (filters.sort && filters.sort !== (filters.q ? "relevance" : "newest")) params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type ActiveFilterChip = { key: string; label: string; removeHref: string };

/** Visible, removable chips for each applied filter (DISC-03 acceptance criteria). */
export function activeFilterChips(
  filters: SearchFilters,
  basePath: string,
  labels: { category?: string; conditions: Record<ItemCondition, string> },
  options: { omitCategory?: boolean } = {},
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const href = (patch: Partial<SearchFilters>) => basePath + toQueryString({ ...filters, ...patch, page: 1 }, options);
  if (filters.q) chips.push({ key: "q", label: `“${filters.q}”`, removeHref: href({ q: "" }) });
  if (filters.category && !options.omitCategory) {
    chips.push({ key: "category", label: labels.category ?? filters.category, removeHref: href({ category: null }) });
  }
  if (filters.freeOnly) chips.push({ key: "free", label: "Free only", removeHref: href({ freeOnly: false, maxPrice: null }) });
  if (!filters.freeOnly && filters.minPrice != null) {
    chips.push({ key: "min", label: `From ₹${filters.minPrice.toLocaleString("en-IN")}`, removeHref: href({ minPrice: null }) });
  }
  if (!filters.freeOnly && filters.maxPrice != null) {
    chips.push({ key: "max", label: `Up to ₹${filters.maxPrice.toLocaleString("en-IN")}`, removeHref: href({ maxPrice: null }) });
  }
  for (const condition of filters.conditions) {
    chips.push({
      key: `condition-${condition}`,
      label: labels.conditions[condition],
      removeHref: href({ conditions: filters.conditions.filter((c) => c !== condition) }),
    });
  }
  if (filters.includeOnHold) chips.push({ key: "hold", label: "Including on hold", removeHref: href({ includeOnHold: false }) });
  return chips;
}
