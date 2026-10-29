import Link from "next/link";
import { X } from "lucide-react";
import { CategoryIcon } from "@/components/marketplace/category-icon";
import { ProductGrid } from "@/components/marketplace/product-card";
import { EmptyState, Pagination } from "@/components/shared/states";
import { sanitizeZeroResultQuery, track } from "@/lib/analytics";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CONDITION_LABELS } from "@/features/listings/constants";
import { getCategories, searchListings } from "@/features/listings/queries";
import { activeFilterChips, toQueryString, type SearchFilters } from "../params";
import { MobileFilters, SortMenu } from "./discovery-controls";
import { FilterPanel } from "./filter-panel";

export function CategoryNavigation({ categories, active }: { categories: { slug: string; name: string; icon: string }[]; active?: string | null }) {
  return (
    <nav aria-label="Categories" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2" role="list">
        <li>
          <Link
            href="/marketplace"
            aria-current={!active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted",
              !active && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            All
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/categories/${c.slug}`}
              aria-current={active === c.slug ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted",
                active === c.slug && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              <CategoryIcon icon={c.icon} className="size-4" />
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Shared results view for /marketplace, /search and /categories/[slug] (one implementation, three entry points). */
export async function DiscoveryView({
  filters,
  basePath,
  title,
  description,
  fixedCategory,
  viewerId,
}: {
  filters: SearchFilters;
  basePath: string;
  title: string;
  description?: string;
  fixedCategory?: boolean;
  viewerId: string;
}) {
  const [categories, results] = await Promise.all([getCategories(), searchListings(filters)]);
  const categoryName = categories.find((c) => c.slug === filters.category)?.name;
  const chips = activeFilterChips(filters, basePath, { category: categoryName, conditions: CONDITION_LABELS }, { omitCategory: fixedCategory });
  const activeFilterCount = chips.filter((c) => c.key !== "q").length;

  if (filters.page === 1 && (filters.q || activeFilterCount > 0)) {
    track("search_submitted", viewerId, {
      term_count: filters.q ? filters.q.split(/\s+/).filter(Boolean).length : 0,
      category: filters.category,
      filters: chips.filter((c) => c.key !== "q").map((c) => c.key.replace(/-.*/, "")),
      sort: filters.sort,
      result_count: results.total,
      zero_results: results.total === 0,
      zero_result_query: results.total === 0 && filters.q ? sanitizeZeroResultQuery(filters.q) : undefined,
    });
  }

  const filterForm = (prefix: string) => (
    <FilterPanel filters={filters} categories={categories} action={basePath} fixedCategory={fixedCategory} idPrefix={prefix} />
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <CategoryNavigation categories={categories} active={filters.category} />
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {description ? `${description} · ` : ""}
            {pluralize(results.total, "listing")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MobileFilters activeCount={activeFilterCount}>{filterForm("m")}</MobileFilters>
          <SortMenu value={filters.sort} hasQuery={Boolean(filters.q)} />
        </div>
      </div>

      {chips.length > 0 && (
        <ul className="mb-5 flex flex-wrap gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Link
                href={chip.removeHref}
                className="flex h-8 items-center gap-1.5 rounded-full border bg-secondary px-3 text-sm text-secondary-foreground hover:bg-secondary/70"
                aria-label={`Remove filter ${chip.label}`}
              >
                {chip.label}
                <X className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))}
          <li>
            <Link href={basePath} className="flex h-8 items-center px-2 text-sm font-medium text-primary hover:underline">Clear all</Link>
          </li>
        </ul>
      )}

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border bg-card p-4">{filterForm("d")}</div>
        </aside>
        <div className="min-w-0">
          {results.items.length > 0 ? (
            <>
              <ProductGrid listings={results.items} priorityCount={4} />
              <Pagination
                page={results.page}
                pageCount={results.pageCount}
                hrefFor={(page) => basePath + toQueryString({ ...filters, page }, { omitCategory: fixedCategory })}
              />
            </>
          ) : (
            <EmptyState
              title={filters.q ? `No results for “${filters.q}”` : "Nothing here yet"}
              description={
                chips.length > 0
                  ? "Try fewer filters, a shorter search term or a different category."
                  : "Be the first to list something. Students are looking for textbooks, cycles and hostel essentials."
              }
              action={chips.length > 0 ? { href: basePath, label: "Clear filters" } : { href: "/sell", label: "Sell an item" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
