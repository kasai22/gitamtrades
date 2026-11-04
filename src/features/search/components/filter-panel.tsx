import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CONDITIONS } from "@/features/listings/constants";
import type { Category } from "@/features/listings/queries";
import type { SearchFilters } from "../params";

// Fieldsets default to min-width: min-content, which lets a long category name stretch the whole form.
const fieldsetClass = "grid min-w-0 grid-cols-1 gap-2";
const legendClass = "mb-2 text-sm font-semibold";
const optionClass =
  "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-secondary has-checked:font-medium has-checked:text-secondary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50";
const checkboxClass = "size-4 shrink-0 accent-[var(--primary)]";

function RupeeInput({ id, name, label, placeholder, defaultValue }: { id: string; name: string; label: string; placeholder: string; defaultValue: string | number }) {
  return (
    <div className="flex h-10 min-w-0 overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <span className="flex items-center border-r bg-muted px-3 text-sm font-medium text-muted-foreground" aria-hidden>₹</span>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} name={name} inputMode="numeric" placeholder={placeholder} defaultValue={defaultValue} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground" />
    </div>
  );
}

/**
 * FilterPanel: a plain GET form, so filters work without JavaScript and every result set has a
 * shareable URL (DISC-03). `sidebar` shows its own heading with Reset; `sheet` sits under the sheet title.
 */
export function FilterPanel({
  filters,
  categories,
  action,
  fixedCategory,
  idPrefix = "f",
  variant = "sidebar",
}: {
  filters: SearchFilters;
  categories: Category[];
  action: string;
  fixedCategory?: boolean;
  idPrefix?: string;
  variant?: "sidebar" | "sheet";
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const resetHref = filters.q ? `${action}?q=${encodeURIComponent(filters.q)}` : action;
  return (
    <form action={action} method="get" className="grid grid-cols-1 gap-5" aria-label="Filter listings">
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}

      {variant === "sidebar" && (
        <div className="-mb-1 flex items-center justify-between">
          <p className="text-base font-semibold">Filters</p>
          <Link href={resetHref} className="text-sm font-medium text-muted-foreground hover:text-primary">Reset filters</Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 [&>fieldset+fieldset]:border-t [&>fieldset+fieldset]:pt-5">
        {!fixedCategory && (
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>Category</legend>
            <select
              id={id("category")}
              name="category"
              defaultValue={filters.category ?? ""}
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Category"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </fieldset>
        )}

        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>Price</legend>
          <RupeeInput id={id("min")} name="min" label="Minimum price" placeholder="Minimum price" defaultValue={filters.minPrice ?? ""} />
          <RupeeInput id={id("max")} name="max" label="Maximum price" placeholder="Maximum price" defaultValue={filters.freeOnly ? "" : (filters.maxPrice ?? "")} />
          <label className={optionClass}>
            <input type="checkbox" name="free" value="1" defaultChecked={filters.freeOnly} className={checkboxClass} />
            Free items only
          </label>
        </fieldset>

        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>Condition</legend>
          <div className="grid grid-cols-2 gap-2">
            {CONDITIONS.map((c) => (
              <label key={c.value} className={optionClass}>
                <input type="checkbox" name="condition" value={c.value} defaultChecked={filters.conditions.includes(c.value)} className={checkboxClass} />
                <span className="min-w-0">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>Availability</legend>
          <label className={optionClass}>
            <input type="checkbox" name="hold" value="1" defaultChecked={filters.includeOnHold} className={checkboxClass} />
            Include items on hold
          </label>
        </fieldset>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Apply filters</Button>
        {variant === "sheet" && (
          <Button asChild variant="outline">
            <Link href={resetHref}>Reset</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
