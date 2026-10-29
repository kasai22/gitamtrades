import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDateTime, formatRelative } from "@/lib/format";
import { EntityLink, Muted, PriorityBadge, REPORT_STATUS_LABELS, ReportStatusBadge, SeverityBadge } from "@/features/admin/components/admin-ui";
import { DataTable, FilterBar, PageHeading, SearchField, SegmentTabs, SelectField, TablePagination, UnavailableNotice } from "@/features/admin/components/data-table";
import { hrefWith, parseListParams, pickEnum, pickInt, pickOptionalEnum, UUID } from "@/features/admin/lib/list-params";
import { listReports, REPORT_REASON_FILTERS, REPORT_SORTS, REPORT_STATUS_FILTERS, REPORT_TARGETS, type ReportRow } from "@/features/admin/services/reports";
import { REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";

export const metadata: Metadata = { title: "Reports" };

const STATUS_TABS: { value: (typeof REPORT_STATUS_FILTERS)[number]; label: string }[] = [
  { value: "active", label: "Active queue" },
  { value: "open", label: REPORT_STATUS_LABELS.open },
  { value: "in_review", label: REPORT_STATUS_LABELS.in_review },
  { value: "escalated", label: REPORT_STATUS_LABELS.escalated },
  { value: "actioned", label: REPORT_STATUS_LABELS.actioned },
  { value: "dismissed", label: REPORT_STATUS_LABELS.dismissed },
  { value: "resolved", label: REPORT_STATUS_LABELS.resolved },
  { value: "all", label: "All" },
];

/** ADMIN-02: triage queue for reports and automated escalations. Not a pre-approval queue. */
export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const actor = await requirePermission("reports.view", "/admin/reports");
  const raw = await searchParams;
  const list = parseListParams(raw, { sorts: REPORT_SORTS, defaultSort: "priority" });
  const status = pickEnum(raw, "status", REPORT_STATUS_FILTERS, "active");
  const reason = pickOptionalEnum(raw, "reason", REPORT_REASON_FILTERS);
  const target = pickOptionalEnum(raw, "target", REPORT_TARGETS);
  const priority = pickInt(raw, "priority", 1, 4);
  const severity = pickInt(raw, "severity", 1, 3);
  const assigneeRaw = typeof raw.assignee === "string" ? raw.assignee : undefined;
  const assignee = assigneeRaw === "me" || assigneeRaw === "unassigned" || (assigneeRaw && UUID.test(assigneeRaw)) ? assigneeRaw : undefined;
  const current = {
    q: list.q, status: status === "active" ? undefined : status, reason, target, priority, severity, assignee,
    sort: list.sort === "priority" ? undefined : list.sort, dir: list.dir === "desc" ? undefined : list.dir, pageSize: list.pageSize === 25 ? undefined : list.pageSize,
  };

  let result: { rows: ReportRow[]; total: number } | null = null;
  try {
    result = await listReports(actor, { ...list, status, reason, target, priority, severity, assignee });
  } catch {
    result = null;
  }

  return (
    <>
      <PageHeading
        title="Reports"
        description="Trust & safety cases from students and automated thresholds. The active queue is sorted by priority, then severity, oldest first."
        actions={
          hasPermission(actor, "reports.export") ? (
            <Button asChild size="sm" variant="outline">
              <a href={hrefWith("/api/admin/reports", { status, reason, target }, { format: "csv" })}><Download aria-hidden /> Export CSV</a>
            </Button>
          ) : undefined
        }
      />
      <SegmentTabs label="Report status" active={status} items={STATUS_TABS.map((t) => ({ value: t.value, label: t.label, href: hrefWith("/admin/reports", current, { status: t.value === "active" ? undefined : t.value }) }))} />
      <FilterBar action="/admin/reports" keep={{ status: current.status, sort: current.sort, dir: current.dir, pageSize: current.pageSize }} resetHref="/admin/reports">
        <SearchField label="Case number" defaultValue={list.q} placeholder="R-000123" className="max-w-48" />
        <SelectField name="reason" label="Category" value={reason ?? ""} options={[{ value: "", label: "All categories" }, ...REPORT_REASON_FILTERS.map((r) => ({ value: r, label: REPORT_REASON_LABELS[r] }))]} />
        <SelectField name="target" label="Target" value={target ?? ""} options={[{ value: "", label: "Any target" }, ...REPORT_TARGETS.map((t) => ({ value: t, label: t }))]} />
        <SelectField name="priority" label="Priority" value={priority ? String(priority) : ""} options={[{ value: "", label: "Any" }, { value: "4", label: "Urgent" }, { value: "3", label: "High" }, { value: "2", label: "Normal" }, { value: "1", label: "Low" }]} />
        <SelectField name="severity" label="Severity" value={severity ? String(severity) : ""} options={[{ value: "", label: "Any" }, { value: "3", label: "High" }, { value: "2", label: "Medium" }, { value: "1", label: "Low" }]} />
        <SelectField name="assignee" label="Assignee" value={assignee ?? ""} options={[{ value: "", label: "Anyone" }, { value: "me", label: "Assigned to me" }, { value: "unassigned", label: "Unassigned" }]} />
      </FilterBar>
      {!result ? (
        <UnavailableNotice what="Reports" />
      ) : (
        <>
          <DataTable
            caption="Reports"
            rows={result.rows}
            rowKey={(r) => r.id}
            sort={{ sort: list.sort, dir: list.dir, hrefFor: (sort, dir) => hrefWith("/admin/reports", current, { sort, dir }) }}
            empty={status === "active" ? "The queue is clear." : "No reports match these filters."}
            columns={[
              { key: "case", header: "Case", cell: (r) => <EntityLink href={`/admin/reports/${r.id}`} className="font-mono">{r.caseNumber}</EntityLink> },
              { key: "priority", header: "Priority", sortKey: "priority", cell: (r) => <PriorityBadge priority={r.priority} /> },
              { key: "severity", header: "Severity", sortKey: "severity", cell: (r) => <SeverityBadge severity={r.severity} /> },
              { key: "reason", header: "Category", cell: (r) => REPORT_REASON_LABELS[r.reason] },
              { key: "target", header: "Reported", cell: (r) => <span className="line-clamp-1"><Muted>{r.targetType}: </Muted>{r.targetLabel ?? "deleted"}</span> },
              { key: "reporter", header: "Reporter", cell: (r) => r.reporterName ?? <Muted>Deleted account</Muted> },
              { key: "status", header: "Status", cell: (r) => <ReportStatusBadge status={r.status} /> },
              { key: "assignee", header: "Assignee", cell: (r) => r.assigneeName ?? <Muted>—</Muted> },
              { key: "created", header: "Received", sortKey: "created_at", cell: (r) => <span title={formatDateTime(r.createdAt)}>{formatRelative(r.createdAt)}</span>, className: "whitespace-nowrap" },
              { key: "updated", header: "Updated", sortKey: "updated_at", cell: (r) => formatRelative(r.updatedAt), className: "whitespace-nowrap text-muted-foreground" },
            ]}
          />
          <TablePagination page={list.page} pageSize={list.pageSize} total={result.total} rowCount={result.rows.length} hrefFor={(o) => hrefWith("/admin/reports", current, o)} />
        </>
      )}
    </>
  );
}
