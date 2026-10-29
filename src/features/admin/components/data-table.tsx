import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PAGE_SIZES } from "../lib/list-params";

export function PageHeading({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export type SortState = { sort: string; dir: "asc" | "desc"; hrefFor: (sort: string, dir: "asc" | "desc") => string };

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Server-side sort key; makes the header a sort link. */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right";
};

function SortHeader({ label, sortKey, state }: { label: ReactNode; sortKey: string; state: SortState }) {
  const active = state.sort === sortKey;
  const nextDir = active && state.dir === "desc" ? "asc" : "desc";
  const Icon = !active ? ArrowUpDown : state.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link href={state.hrefFor(sortKey, nextDir)} className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {label}
      <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
      <span className="sr-only">{active ? `sorted ${state.dir === "desc" ? "descending" : "ascending"}; ` : ""}sort {nextDir === "desc" ? "descending" : "ascending"}</span>
    </Link>
  );
}

/** DataTable: dense, semantic table with sortable headers and an explicit empty state. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  sort,
  empty = "Nothing to show.",
  caption,
}: {
  rows: readonly T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  sort?: SortState;
  empty?: ReactNode;
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className="text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={cn("h-9 text-xs font-medium whitespace-nowrap text-muted-foreground", c.align === "right" && "text-right", c.headerClassName)}
                aria-sort={sort && c.sortKey && sort.sort === c.sortKey ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {sort && c.sortKey ? <SortHeader label={c.header} sortKey={c.sortKey} state={sort} /> : c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">{empty}</TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("py-2", c.align === "right" && "text-right tabular-nums", c.className)}>{c.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function TablePagination({ page, pageSize, total, rowCount, hrefFor }: { page: number; pageSize: number; total: number; rowCount: number; hrefFor: (overrides: { page?: number; pageSize?: number }) => string }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = rowCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = rowCount === 0 ? 0 : start + rowCount - 1;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p aria-live="polite">
        {total === 0 && page > 1 ? "No results on this page." : total === 0 ? "No results" : `Showing ${start.toLocaleString("en-IN")}–${end.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">Rows</span>
        <nav aria-label="Rows per page" className="flex gap-0.5">
          {PAGE_SIZES.map((size) => (
            <Link key={size} href={hrefFor({ pageSize: size, page: 1 })} aria-current={size === pageSize ? "true" : undefined} className={cn("rounded px-1.5 py-0.5 hover:bg-muted", size === pageSize && "bg-muted font-medium text-foreground")}>
              {size}
            </Link>
          ))}
        </nav>
        <nav aria-label="Pagination" className="flex items-center gap-1">
          {page > 1 ? (
            <Button asChild variant="outline" size="icon-sm">
              <Link href={hrefFor({ page: page - 1 })} rel="prev" aria-label="Previous page"><ChevronLeft aria-hidden /></Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon-sm" disabled aria-label="Previous page"><ChevronLeft aria-hidden /></Button>
          )}
          <span className="px-1 tabular-nums">{page} / {pageCount}</span>
          {page < pageCount ? (
            <Button asChild variant="outline" size="icon-sm">
              <Link href={hrefFor({ page: page + 1 })} rel="next" aria-label="Next page"><ChevronRight aria-hidden /></Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon-sm" disabled aria-label="Next page"><ChevronRight aria-hidden /></Button>
          )}
        </nav>
      </div>
    </div>
  );
}

const fieldClass = "h-9 rounded-md border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** FilterBar: GET form for search + filters. Works without JavaScript; sort and page size are preserved via hidden inputs. */
export function FilterBar({ action, children, keep = {}, resetHref }: { action: string; children: ReactNode; keep?: Record<string, string | number | undefined>; resetHref?: string }) {
  return (
    <form action={action} method="get" role="search" className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
      {Object.entries(keep).map(([k, v]) => (v === undefined || v === "" ? null : <input key={k} type="hidden" name={k} value={String(v)} />))}
      {children}
      <div className="flex gap-2">
        <Button type="submit" size="sm">Apply</Button>
        {resetHref && (
          <Button asChild variant="ghost" size="sm">
            <Link href={resetHref}>Reset</Link>
          </Button>
        )}
      </div>
    </form>
  );
}

export function SearchField({ name = "q", label, defaultValue, placeholder, className }: { name?: string; label: string; defaultValue?: string; placeholder?: string; className?: string }) {
  return (
    <div className={cn("grid min-w-48 flex-1 gap-1", className)}>
      <label htmlFor={`f-${name}`} className="text-xs font-medium text-muted-foreground">{label}</label>
      <input id={`f-${name}`} name={name} type="search" defaultValue={defaultValue} placeholder={placeholder} maxLength={80} className={fieldClass} />
    </div>
  );
}

export function SelectField({ name, label, value, options, className }: { name: string; label: string; value?: string; options: readonly { value: string; label: string }[]; className?: string }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <label htmlFor={`f-${name}`} className="text-xs font-medium text-muted-foreground">{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value ?? ""} className={fieldClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function DateField({ name, label, value, max }: { name: string; label: string; value?: string; max?: string }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={`f-${name}`} className="text-xs font-medium text-muted-foreground">{label}</label>
      <input id={`f-${name}`} name={name} type="date" defaultValue={value} max={max} className={fieldClass} />
    </div>
  );
}

/** Segmented links (status tabs). */
export function SegmentTabs({ items, active, label = "Filter" }: { items: { value: string; label: string; href: string; count?: number | null }[]; active: string; label?: string }) {
  return (
    <nav aria-label={label} className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1">
      {items.map((item) => (
        <Link
          key={item.value}
          href={item.href}
          aria-current={item.value === active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm whitespace-nowrap hover:bg-muted",
            item.value === active ? "border-primary bg-primary/8 font-medium text-foreground" : "bg-card text-muted-foreground",
          )}
        >
          {item.label}
          {item.count !== undefined && item.count !== null && <span className="rounded bg-muted px-1 text-xs tabular-nums">{item.count.toLocaleString("en-IN")}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Metric: compact number tile. `null` means the value couldn't be loaded and is shown as unavailable, never as 0. */
export function Metric({ label, value, display, hint, href, tone }: { label: string; value: number | null | undefined; display?: string; hint?: ReactNode; href?: string; tone?: "warning" | "danger" }) {
  const body = (
    <>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      {display !== undefined ? (
        <p className="mt-0.5 text-xl font-semibold tabular-nums">{display}</p>
      ) : value === null || value === undefined ? (
        <p className="mt-0.5 text-sm font-medium text-muted-foreground" title="This value couldn't be loaded">Unavailable</p>
      ) : (
        <p className={cn("mt-0.5 text-xl font-semibold tabular-nums", tone === "warning" && value > 0 && "text-warning-foreground", tone === "danger" && value > 0 && "text-destructive")}>
          {value.toLocaleString("en-IN")}
        </p>
      )}
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border bg-card px-3 py-2.5 hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">{body}</Link>
  ) : (
    <div className="rounded-lg border bg-card px-3 py-2.5">{body}</div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-xl border bg-card p-3" aria-hidden>
      <div className="mb-3 h-8 animate-pulse rounded-md bg-muted" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="mb-2 h-7 animate-pulse rounded bg-muted/70" />
      ))}
    </div>
  );
}

export function UnavailableNotice({ what }: { what: string }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {what} couldn&apos;t be loaded right now. Values below may be incomplete; nothing has been changed.
    </p>
  );
}
