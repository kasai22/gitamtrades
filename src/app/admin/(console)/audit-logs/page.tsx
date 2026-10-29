import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { EntityLink, Muted, OutcomeBadge, RoleBadge } from "@/features/admin/components/admin-ui";
import { DataTable, DateField, FilterBar, PageHeading, SearchField, SelectField, TablePagination, UnavailableNotice } from "@/features/admin/components/data-table";
import { todayInZone } from "@/features/admin/lib/date-range";
import { hrefWith, parseListParams, pickOptionalEnum, pickString, pickUuid } from "@/features/admin/lib/list-params";
import { AUDIT_OUTCOMES, AUDIT_TARGET_TYPES, listAuditLogs, type AuditFilters } from "@/features/admin/services/audit-logs";

export const metadata: Metadata = { title: "Audit log" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TARGET_LINKS: Record<string, string> = { user: "/admin/users/", listing: "/admin/listings/", report: "/admin/reports/", conversation: "/admin/messages/" };

/** Append-only audit trail: entries can't be edited or deleted by anyone through the app or the API. */
export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit-logs">) {
  const actor = await requirePermission("audit.view", "/admin/audit-logs");
  const raw = await searchParams;
  const list = parseListParams(raw, { sorts: ["created_at"] as const, defaultSort: "created_at", defaultPageSize: 50 });
  const from = pickString(raw, "from", 10);
  const to = pickString(raw, "to", 10);
  const filters: AuditFilters = {
    action: pickString(raw, "action", 60).replace(/[^a-z_.]/g, "") || undefined,
    actorId: pickUuid(raw, "actor"),
    targetType: pickOptionalEnum(raw, "targetType", AUDIT_TARGET_TYPES),
    targetId: pickString(raw, "targetId", 120) || undefined,
    outcome: pickOptionalEnum(raw, "outcome", AUDIT_OUTCOMES),
    from: ISO.test(from) ? from : undefined,
    to: ISO.test(to) ? to : undefined,
  };
  const current = { action: filters.action, actor: filters.actorId, targetType: filters.targetType, targetId: filters.targetId, outcome: filters.outcome, from: filters.from, to: filters.to, pageSize: list.pageSize === 50 ? undefined : list.pageSize };

  let result: Awaited<ReturnType<typeof listAuditLogs>> | null = null;
  try {
    result = await listAuditLogs(actor, filters, { limit: list.pageSize, offset: list.offset });
  } catch {
    result = null;
  }

  return (
    <>
      <PageHeading
        title="Audit log"
        description="Every privileged action and sensitive access, newest first, including denied attempts. Records are append-only and never contain passwords, tokens or message text."
        actions={
          hasPermission(actor, "audit.export") ? (
            <Button asChild size="sm" variant="outline">
              <a href={hrefWith("/api/admin/audit-logs", { ...current, pageSize: undefined }, { format: "csv" })}><Download aria-hidden /> Export CSV</a>
            </Button>
          ) : undefined
        }
      />
      <FilterBar action="/admin/audit-logs" keep={{ pageSize: current.pageSize }} resetHref="/admin/audit-logs">
        <SearchField name="action" label="Action (prefix)" defaultValue={filters.action} placeholder="e.g. listing. or user.restrict" className="max-w-56" />
        <SelectField name="targetType" label="Target type" value={filters.targetType ?? ""} options={[{ value: "", label: "Any" }, ...AUDIT_TARGET_TYPES.map((t) => ({ value: t, label: t }))]} />
        <SearchField name="targetId" label="Target ID" defaultValue={filters.targetId} className="max-w-64" />
        <SearchField name="actor" label="Actor user ID" defaultValue={filters.actorId} className="max-w-64" />
        <SelectField name="outcome" label="Outcome" value={filters.outcome ?? ""} options={[{ value: "", label: "Any" }, ...AUDIT_OUTCOMES.map((o) => ({ value: o, label: o }))]} />
        <DateField name="from" label="From" value={filters.from} max={todayInZone()} />
        <DateField name="to" label="To" value={filters.to} max={todayInZone()} />
      </FilterBar>
      {!result ? (
        <UnavailableNotice what="The audit log" />
      ) : (
        <>
          <DataTable
            caption="Audit records"
            rows={result.rows}
            rowKey={(l) => l.id}
            empty="No audit records match these filters."
            columns={[
              { key: "when", header: "When", cell: (l) => formatDateTime(l.created_at), className: "whitespace-nowrap" },
              {
                key: "actor",
                header: "Actor",
                cell: (l) => (
                  <span className="grid gap-0.5">
                    {l.actor_id ? <EntityLink href={`/admin/users/${l.actor_id}`} className="font-normal">{l.actor?.display_name ?? "Former staff"}</EntityLink> : <Muted>System</Muted>}
                    <span className="flex flex-wrap gap-0.5">{l.actor_roles.map((r) => <RoleBadge key={r} role={r} />)}</span>
                  </span>
                ),
              },
              { key: "action", header: "Action", cell: (l) => <code className="text-xs">{l.action}</code> },
              { key: "outcome", header: "Outcome", cell: (l) => <OutcomeBadge outcome={l.outcome} /> },
              {
                key: "target",
                header: "Target",
                cell: (l) => (
                  <span className="text-xs">
                    {l.target_type}{" "}
                    {l.target_id && (TARGET_LINKS[l.target_type] && /^[0-9a-f-]{36}$/i.test(l.target_id) ? <EntityLink href={`${TARGET_LINKS[l.target_type]}${l.target_id}`} className="font-mono font-normal">{l.target_id.slice(0, 8)}</EntityLink> : <code>{l.target_id}</code>)}
                  </span>
                ),
              },
              { key: "reason", header: "Reason", cell: (l) => <span className="line-clamp-2 max-w-xs">{l.reason ?? "—"}</span> },
              {
                key: "change",
                header: "Details",
                cell: (l) =>
                  l.before || l.after || Object.keys((l.metadata as object) ?? {}).length ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">View</summary>
                      <pre className="mt-1 max-w-sm overflow-x-auto text-[11px]">{JSON.stringify({ before: l.before, after: l.after, metadata: l.metadata }, null, 2)}</pre>
                    </details>
                  ) : "—",
              },
            ]}
          />
          <TablePagination page={list.page} pageSize={list.pageSize} total={result.total} rowCount={result.rows.length} hrefFor={(o) => hrefWith("/admin/audit-logs", current, o)} />
        </>
      )}
    </>
  );
}
