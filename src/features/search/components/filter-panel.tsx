import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONDITIONS } from "@/features/listings/constants";
import type { Category } from "@/features/listings/queries";
import type { SearchFilters } from "../params";

/**
 * FilterPanel: a plain GET form, so filters work without JavaScript and every result set has a
 * shareable URL (DISC-03).
 */
export function FilterPanel({
  filters,
  categories,
  action,
  fixedCategory,
  idPrefix = "f",
}: {
  filters: SearchFilters;
  categories: Category[];
  action: string;
  fixedCategory?: boolean;
  idPrefix?: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <form action={action} method="get" className="grid gap-6" aria-label="Filter listings">
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}

      {!fixedCategory && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Category</legend>
          <select
            id={id("category")}
            name="category"
            defaultValue={filters.category ?? ""}
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </fieldset>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Price (₹)</legend>
        <div className="flex items-center gap-2">
          <label htmlFor={id("min")} className="sr-only">Minimum price</label>
          <Input id={id("min")} name="min" inputMode="numeric" placeholder="Min" defaultValue={filters.minPrice ?? ""} />
          <span className="text-muted-foreground" aria-hidden>–</span>
          <label htmlFor={id("max")} className="sr-only">Maximum price</label>
          <Input id={id("max")} name="max" inputMode="numeric" placeholder="Max" defaultValue={filters.freeOnly ? "" : (filters.maxPrice ?? "")} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="free" value="1" defaultChecked={filters.freeOnly} className="size-4 accent-[var(--primary)]" />
          Free items only
        </label>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Condition</legend>
        {CONDITIONS.map((c) => (
          <label key={c.value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="condition" value={c.value} defaultChecked={filters.conditions.includes(c.value)} className="size-4 accent-[var(--primary)]" />
            {c.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Availability</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hold" value="1" defaultChecked={filters.includeOnHold} className="size-4 accent-[var(--primary)]" />
          Include items on hold
        </label>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Apply filters</Button>
        <Button asChild variant="ghost">
          <Link href={filters.q ? `${action}?q=${encodeURIComponent(filters.q)}` : action}>Reset</Link>
        </Button>
      </div>
    </form>
  );
}
