import type { Metadata } from "next";
import Image from "next/image";
import { Package } from "lucide-react";
import { PriceDisplay } from "@/components/marketplace/badges";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BulkCheckbox, BulkListingBar, BulkSelectAll } from "@/features/admin/components/bulk-listing-bar";
import { EntityLink, LISTING_STATE_LABELS, ListingStateBadge, ModerationFlag } from "@/features/admin/components/admin-ui";
import { DataTable, FilterBar, PageHeading, SearchField, SegmentTabs, SelectField, TablePagination, UnavailableNotice, type DataColumn } from "@/features/admin/components/data-table";
import { hrefWith, parseListParams, pickEnum, pickOptionalEnum } from "@/features/admin/lib/list-params";
import { LISTING_SIGNALS, LISTING_SORTS, LISTING_STATES, listListings, type AdminListingRow } from "@/features/admin/services/listings";

export const metadata: Metadata = { title: "Listings" };

const SIGNAL_CODES = LISTING_SIGNALS.map((s) => s.code);

/** Listing management: investigation and post-publication enforcement. Listings never wait for approval here. */
export default async function AdminListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  const actor = await requirePermission("listings.view", "/admin/listings");
  const raw = await searchParams;
  const list = parseListParams(raw, { sorts: LISTING_SORTS, defaultSort: "updated_at" });
  const state = pickEnum(raw, "state", LISTING_STATES, "all");
  const signal = pickOptionalEnum(raw, "signal", SIGNAL_CODES);
  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("slug, name").order("sort_order");
  const categorySlugs = (categories ?? []).map((c) => c.slug);
  const category = pickOptionalEnum(raw, "category", categorySlugs);
  const current = {
    q: list.q,
    state: state === "all" ? undefined : state,
    category,
    signal,
    sort: list.sort === "updated_at" ? undefined : list.sort,
    dir: list.dir === "desc" ? undefined : list.dir,
    pageSize: list.pageSize === 25 ? undefined : list.pageSize,
  };

  let result: { rows: AdminListingRow[]; total: number } | null = null;
  try {
    result = await listListings(actor, { ...list, state, category, signal });
  } catch {
    result = null;
  }
  const canModerate = hasPermission(actor, "listings.moderate");

  const columns: DataColumn<AdminListingRow>[] = [
    ...(canModerate ? [{ key: "select", header: <BulkSelectAll />, cell: (l: AdminListingRow) => <BulkCheckbox id={l.id} label={l.title} />, className: "w-8" }] : []),
    {
      key: "listing",
      header: "Listing",
      cell: (l) => (
        <span className="flex min-w-56 items-center gap-2.5">
          <span className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
            {l.thumbUrl ? <Image src={l.thumbUrl} alt="" fill unoptimized sizes="40px" className="object-cover" /> : <Package className="m-auto mt-2.5 size-4 text-muted-foreground" aria-hidden />}
          </span>
          <span className="min-w-0">
            <EntityLink href={`/admin/listings/${l.id}`} className="line-clamp-1">{l.title}</EntityLink>
            <span className="block truncate text-xs text-muted-foreground">{l.categoryName}</span>
          </span>
        </span>
      ),
    },
    { key: "price", header: "Price", sortKey: "price", align: "right", cell: (l) => <PriceDisplay priceInr={l.priceInr} size="sm" /> },
    { key: "seller", header: "Seller", cell: (l) => (hasPermission(actor, "users.view") ? <EntityLink href={`/admin/users/${l.sellerId}`} className="font-normal">{l.sellerName}</EntityLink> : l.sellerName) },
    {
      key: "state",
      header: "State",
      cell: (l) => (
        <span className="flex flex-wrap gap-1">
          <ListingStateBadge state={l.adminState} />
          {l.openReportCount > 0 && <ListingStateBadge state="flagged" />}
        </span>
      ),
    },
    { key: "signals", header: "Signals", cell: (l) => <ModerationFlag codes={l.reasonCodes} /> },
    { key: "reports", header: "Open reports", sortKey: "reports", align: "right", cell: (l) => (l.openReportCount ? <span className="font-medium text-destructive">{l.openReportCount}</span> : 0) },
    { key: "created", header: "Created", sortKey: "created_at", cell: (l) => formatDateTime(l.createdAt), className: "whitespace-nowrap" },
    { key: "updated", header: "Updated", sortKey: "updated_at", cell: (l) => formatDateTime(l.updatedAt), className: "whitespace-nowrap" },
  ];

  return (
    <>
      <PageHeading
        title="Listings"
        description="Every category and state, including hidden listings. Normal listings publish immediately after automated checks; use this page to investigate, quarantine, remove or restore."
      />
      <SegmentTabs
        label="Listing state"
        active={state}
        items={LISTING_STATES.map((s) => ({ value: s, label: s === "all" ? "All" : LISTING_STATE_LABELS[s], href: hrefWith("/admin/listings", current, { state: s === "all" ? undefined : s }) }))}
      />
      <FilterBar action="/admin/listings" keep={{ state: current.state, sort: current.sort, dir: current.dir, pageSize: current.pageSize }} resetHref="/admin/listings">
        <SearchField label="Search" defaultValue={list.q} placeholder="Title, seller name or listing ID" />
        <SelectField name="category" label="Category" value={category ?? ""} options={[{ value: "", label: "All categories" }, ...(categories ?? []).map((c) => ({ value: c.slug, label: c.name }))]} />
        <SelectField name="signal" label="Investigation signal" value={signal ?? ""} options={[{ value: "", label: "Any" }, ...LISTING_SIGNALS.map((s) => ({ value: s.code, label: s.label }))]} />
      </FilterBar>
      {canModerate && <BulkListingBar />}
      {!result ? (
        <UnavailableNotice what="Listings" />
      ) : (
        <>
          <DataTable
            caption="Listings"
            rows={result.rows}
            rowKey={(l) => l.id}
            columns={columns}
            sort={{ sort: list.sort, dir: list.dir, hrefFor: (sort, dir) => hrefWith("/admin/listings", current, { sort, dir }) }}
            empty={state === "quarantined" ? "Nothing is quarantined." : "No listings match these filters."}
          />
          <TablePagination page={list.page} pageSize={list.pageSize} total={result.total} rowCount={result.rows.length} hrefFor={(o) => hrefWith("/admin/listings", current, o)} />
        </>
      )}
    </>
  );
}
