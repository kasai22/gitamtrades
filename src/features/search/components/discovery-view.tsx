import Link from "next/link";
import { ChevronRight, LayoutGrid, Search, X } from "lucide-react";
import { CategoryIcon } from "@/components/marketplace/category-icon";
import { ProductGrid } from "@/components/marketplace/product-card";
import { EmptyState, Pagination } from "@/components/shared/states";
import { sanitizeZeroResultQuery, track } from "@/lib/analytics";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CONDITION_LABELS } from "@/features/listings/constants";
import { getCategories, getSavedListingIds, searchListings } from "@/features/listings/queries";
import { activeFilterChips, toQueryString, type SearchFilters } from "../params";
import { MobileFilters, SortMenu } from "./discovery-controls";
import { FilterPanel } from "./filter-panel";
import { ScrollRail } from "./scroll-rail";

export function CategoryNavigation({ categories, active }: { categories: { slug: string; name: string; icon: string }[]; active?: string | null }) {
  const items = [{ slug: null, name: "All listings", icon: null, href: "/marketplace" }, ...categories.map((c) => ({ ...c, href: `/categories/${c.slug}` }))];
  return (
    <nav aria-label="Categories">
      <ScrollRail>
        <ul className="flex w-max gap-2" role="list">
          {items.map((item) => {
            const current = item.slug === null ? !active : active === item.slug;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "group flex h-11 items-center gap-2.5 rounded-full border py-1 pr-4 pl-1.5 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    current
                      ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "bg-card text-foreground hover:border-primary/30 hover:shadow-sm",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full transition-colors",
                      current ? "bg-primary-foreground/15 text-primary-foreground" : "bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                    )}
                  >
                    {item.icon ? <CategoryIcon icon={item.icon} className="size-4" /> : <LayoutGrid className="size-4" aria-hidden />}
                  </span>
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </ScrollRail>
    </nav>
  );
}

/** Search inside the current view: a GET form that keeps the applied filters (and category) intact. */
function ScopedSearch({ filters, action, fixedCategory, placeholder }: { filters: SearchFilters; action: string; fixedCategory?: boolean; placeholder: string }) {
  const hidden: [string, string][] = [];
  if (filters.category && !fixedCategory) hidden.push(["category", filters.category]);
  if (filters.freeOnly) hidden.push(["free", "1"]);
  else {
    if (filters.minPrice != null) hidden.push(["min", String(filters.minPrice)]);
    if (filters.maxPrice != null) hidden.push(["max", String(filters.maxPrice)]);
  }
  if (filters.conditions.length) hidden.push(["condition", filters.conditions.join(",")]);
  if (filters.includeOnHold) hidden.push(["hold", "1"]);
  return (
    <form action={action} method="get" role="search" className="relative" aria-label="Search these listings">
      {hidden.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor="scoped-search" className="sr-only">{placeholder}</label>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        key={filters.q}
        id="scoped-search"
        name="q"
        type="search"
        defaultValue={filters.q}
        placeholder={placeholder}
        maxLength={100}
        autoComplete="off"
        className="h-12 w-full rounded-xl border bg-card pr-4 pl-11 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </form>
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
  const savedIds = await getSavedListingIds(viewerId, results.items.map((i) => i.id));
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

  const filterForm = (prefix: string, variant: "sidebar" | "sheet") => (
    <FilterPanel filters={filters} categories={categories} action={basePath} fixedCategory={fixedCategory} idPrefix={prefix} variant={variant} />
  );

  const crumbs: { label: string; href?: string }[] = [{ label: "Home", href: "/" }];
  if (fixedCategory) crumbs.push({ label: "Marketplace", href: "/marketplace" }, { label: title });
  else if (basePath === "/search") crumbs.push({ label: "Marketplace", href: "/marketplace" }, { label: "Search" });
  else crumbs.push({ label: "Marketplace" });

  return (
    <>
      <div className="border-b bg-muted/40">
        <div className="mx-auto w-full max-w-7xl px-4 pt-5 pb-5 sm:px-6 sm:pt-6">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              {crumbs.map((crumb, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:text-primary">{crumb.label}</Link>
                  ) : (
                    <span aria-current="page" className="font-medium text-foreground">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-3 mb-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
              <span className="rounded-full bg-card px-3 py-1 text-sm font-medium text-primary tabular-nums ring-1 ring-border" aria-live="polite">
                {pluralize(results.total, "listing")}
              </span>
            </div>
            {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
          </div>
          <CategoryNavigation categories={categories} active={filters.category} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden lg:block" aria-label="Filters">
            <div className="sticky top-24 rounded-2xl border bg-card p-5 shadow-xs">{filterForm("d", "sidebar")}</div>
          </aside>

          <div className="min-w-0">
            <ScopedSearch
              filters={filters}
              action={basePath}
              fixedCategory={fixedCategory}
              placeholder={fixedCategory ? `Search in ${title}` : "Search listings"}
            />

            <div className="mt-4 mb-5 flex flex-wrap items-center justify-between gap-3">
              {chips.length > 0 ? (
                <ul className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Active filters">
                  {chips.map((chip) => (
                    <li key={chip.key}>
                      <Link
                        href={chip.removeHref}
                        className="flex h-8 items-center gap-1.5 rounded-full border border-primary/20 bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/70"
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{pluralize(results.total, "listing")}</span>
                </p>
              )}
              <div className="ml-auto flex items-center gap-2">
                <MobileFilters activeCount={activeFilterCount}>{filterForm("m", "sheet")}</MobileFilters>
                <SortMenu value={filters.sort} hasQuery={Boolean(filters.q)} />
              </div>
            </div>

            {results.items.length > 0 ? (
              <>
                <ProductGrid listings={results.items} priorityCount={3} savedIds={savedIds} layout="sidebar" />
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
    </>
  );
}
