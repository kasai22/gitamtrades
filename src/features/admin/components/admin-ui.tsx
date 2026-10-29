import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABELS, isAdminRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

export const REPORT_STATUS_LABELS = {
  open: "Open",
  in_review: "Investigating",
  escalated: "Escalated",
  actioned: "Action taken",
  dismissed: "Dismissed",
  resolved: "Resolved",
} as const;

const REPORT_STATUS_VARIANT: Record<keyof typeof REPORT_STATUS_LABELS, BadgeVariant> = {
  open: "info",
  in_review: "warning",
  escalated: "destructive",
  actioned: "success",
  dismissed: "secondary",
  resolved: "success",
};

export function ReportStatusBadge({ status }: { status: keyof typeof REPORT_STATUS_LABELS }) {
  return <Badge variant={REPORT_STATUS_VARIANT[status]}>{REPORT_STATUS_LABELS[status]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: number }) {
  return (
    <Badge variant={severity >= 3 ? "destructive" : severity === 2 ? "warning" : "secondary"}>
      {severity >= 3 ? "High" : severity === 2 ? "Medium" : "Low"}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: number }) {
  const label = ({ 1: "Low", 2: "Normal", 3: "High", 4: "Urgent" } as Record<number, string>)[priority] ?? "Normal";
  return <Badge variant={priority >= 4 ? "destructive" : priority === 3 ? "warning" : "outline"}>{label}</Badge>;
}

export const LISTING_STATE_LABELS = {
  live: "Live",
  reserved: "Reserved",
  sold: "Sold",
  expired: "Expired",
  draft: "Draft",
  flagged: "Flagged",
  quarantined: "Quarantined",
  blocked: "Auto-blocked",
  removed: "Removed",
} as const;

const LISTING_STATE_VARIANT: Record<keyof typeof LISTING_STATE_LABELS, BadgeVariant> = {
  live: "success",
  reserved: "info",
  sold: "secondary",
  expired: "outline",
  draft: "outline",
  flagged: "warning",
  quarantined: "warning",
  blocked: "destructive",
  removed: "destructive",
};

export function ListingStateBadge({ state }: { state: keyof typeof LISTING_STATE_LABELS }) {
  return <Badge variant={LISTING_STATE_VARIANT[state]}>{LISTING_STATE_LABELS[state]}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  return <Badge variant={role === "super_admin" ? "default" : "secondary"}>{isAdminRole(role) ? ROLE_LABELS[role] : role}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  return <Badge variant={outcome === "success" ? "success" : outcome === "denied" ? "warning" : "destructive"}>{outcome}</Badge>;
}

/** ModerationFlag: compact reason-code chips for automated decisions. */
export function ModerationFlag({ codes }: { codes: readonly string[] }) {
  if (!codes.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <code key={code} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{code}</code>
      ))}
    </span>
  );
}

export function DetailList({ items, className }: { items: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[150px_1fr]", className)}>
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EntityLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href} className={cn("font-medium text-primary hover:underline", className)}>{children}</Link>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

// ---------------------------------------------------------------------------
// Simple list table (used by small panels: appeals, community, deletion requests)
// ---------------------------------------------------------------------------
export type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; className?: string };

export function AdminDataTable<T>({ rows, columns, rowKey, empty = "Nothing to show." }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((c) => (
              <TableHead key={c.key} className={cn("h-9 text-xs font-medium text-muted-foreground", c.className)}>{c.header}</TableHead>
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
                  <TableCell key={c.key} className={cn("py-2", c.className)}>{c.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function FilterTabs({ tabs, active }: { tabs: { href: string; label: string; value: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="Filter" className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          aria-current={tab.value === active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-sm whitespace-nowrap hover:bg-muted",
            tab.value === active ? "border-primary bg-primary/8 font-medium" : "bg-card text-muted-foreground",
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1 opacity-80">({tab.count})</span>}
        </Link>
      ))}
    </nav>
  );
}
