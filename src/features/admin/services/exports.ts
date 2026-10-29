import "server-only";
import { assertPermission } from "@/lib/auth/admin";
import type { Permission } from "@/lib/auth/permissions";
import type { Viewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { fromDbError } from "../errors";
import { toCsv, MAX_EXPORT_ROWS } from "../lib/csv";
import type { DateRange } from "../lib/date-range";
import { getAnalytics } from "./analytics";
import { listAuditLogs, type AuditFilters } from "./audit-logs";
import { listReports, type ReportFilters } from "./reports";
import { listUsers, type UserStatusFilter } from "./users";

/**
 * CSV exports. Each dataset is limited to the columns an operator needs: no emails, message bodies,
 * report details/evidence, contact data or free text written by students. Every export is recorded
 * by admin_record_export() (permission re-check + 20/hour rate limit) before data is returned.
 */
export const EXPORT_PERMISSIONS = {
  analytics_daily: "analytics.export",
  reports: "reports.export",
  audit_logs: "audit.export",
  users: "users.export",
} as const satisfies Record<string, Permission>;
export type ExportDataset = keyof typeof EXPORT_PERMISSIONS;

async function recordExport(actor: Viewer, dataset: ExportDataset, rows: number, filters: Record<string, unknown>) {
  const { error } = await createAdminClient().rpc("admin_record_export", {
    p_actor: actor.id,
    p_dataset: dataset,
    p_permission: EXPORT_PERMISSIONS[dataset],
    p_rows: rows,
    p_filters: filters as Json,
  });
  if (error) throw fromDbError(error);
}

/** Pages through a list service up to MAX_EXPORT_ROWS. */
async function collect<T>(fetchPage: (limit: number, offset: number) => Promise<{ rows: T[] }>) {
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += 100) {
    const page = await fetchPage(100, offset);
    rows.push(...page.rows);
    if (page.rows.length < 100) break;
  }
  return rows.slice(0, MAX_EXPORT_ROWS);
}

function stamp(range?: { from: string; to: string }) {
  return range ? `${range.from}_to_${range.to}` : new Date().toISOString().slice(0, 10);
}

export async function exportAnalyticsDaily(actor: Viewer, range: DateRange) {
  assertPermission(actor, "analytics.export");
  const data = await getAnalytics(actor, range);
  const csv = toCsv(data.series, [
    { header: "date", value: (r) => r.day },
    { header: "registrations", value: (r) => r.registrations },
    { header: "verifications", value: (r) => r.verifications },
    { header: "listings_created", value: (r) => r.listings_created },
    { header: "listings_published", value: (r) => r.listings_published },
    { header: "listings_sold", value: (r) => r.listings_sold },
    { header: "conversations_started", value: (r) => r.conversations },
    { header: "reports", value: (r) => r.reports },
    { header: "searches", value: (r) => r.searches },
    { header: "zero_result_searches", value: (r) => r.zero_result_searches },
    { header: "listing_views", value: (r) => r.listing_views },
  ]);
  await recordExport(actor, "analytics_daily", data.series.length, { from: range.from, to: range.to });
  return { filename: `analytics_daily_${stamp(range)}.csv`, csv };
}

/** De-identified case list: no names, details, evidence or resolution text. */
export async function exportReports(actor: Viewer, filters: ReportFilters & { q: string }) {
  assertPermission(actor, "reports.export");
  // The analyst role may export without reports.view: read through the service role, columns fixed here.
  const rows = actor.permissions.includes("reports.view")
    ? await collect((limit, offset) =>
        listReports(actor, { ...filters, page: 1, pageSize: limit, offset, sort: "created_at", dir: "desc" }),
      ).then((r) => r.map((x) => ({ case_number: x.caseNumber, target_type: x.targetType, reason: x.reason, severity: x.severity, priority: x.priority, status: x.status, resolution_code: x.resolutionCode, created_at: x.createdAt, resolved_at: x.resolvedAt })))
    : await (async () => {
        let query = createAdminClient()
          .from("reports")
          .select("case_number, target_type, reason, severity, priority, status, resolution_code, created_at, resolved_at")
          .order("created_at", { ascending: false })
          .limit(MAX_EXPORT_ROWS);
        if (filters.status === "active") query = query.in("status", ["open", "in_review", "escalated"]);
        else if (filters.status === "closed") query = query.in("status", ["actioned", "dismissed", "resolved"]);
        else if (filters.status !== "all") query = query.eq("status", filters.status);
        const { data, error } = await query;
        if (error) throw fromDbError(error);
        return data ?? [];
      })();
  const csv = toCsv(rows, [
    { header: "case_number", value: (r) => r.case_number },
    { header: "target_type", value: (r) => r.target_type },
    { header: "reason", value: (r) => r.reason },
    { header: "severity", value: (r) => r.severity },
    { header: "priority", value: (r) => r.priority },
    { header: "status", value: (r) => r.status },
    { header: "resolution_code", value: (r) => r.resolution_code },
    { header: "created_at", value: (r) => r.created_at },
    { header: "resolved_at", value: (r) => r.resolved_at },
    {
      header: "hours_to_resolution",
      value: (r) => (r.resolved_at ? Math.round(((Date.parse(r.resolved_at) - Date.parse(r.created_at)) / 3_600_000) * 10) / 10 : null),
    },
  ]);
  await recordExport(actor, "reports", rows.length, { status: filters.status, reason: filters.reason ?? null, target: filters.target ?? null });
  return { filename: `reports_${stamp()}.csv`, csv };
}

export async function exportAuditLogs(actor: Viewer, filters: AuditFilters) {
  assertPermission(actor, "audit.export");
  const rows = await collect((limit, offset) => listAuditLogs(actor, filters, { limit, offset }));
  const csv = toCsv(rows, [
    { header: "created_at", value: (r) => r.created_at },
    { header: "actor_id", value: (r) => r.actor_id },
    { header: "actor_name", value: (r) => r.actor?.display_name ?? null },
    { header: "actor_roles", value: (r) => r.actor_roles.join(" ") },
    { header: "action", value: (r) => r.action },
    { header: "outcome", value: (r) => r.outcome },
    { header: "target_type", value: (r) => r.target_type },
    { header: "target_id", value: (r) => r.target_id },
    { header: "reason", value: (r) => r.reason },
    { header: "before", value: (r) => (r.before ? JSON.stringify(r.before) : null) },
    { header: "after", value: (r) => (r.after ? JSON.stringify(r.after) : null) },
  ]);
  await recordExport(actor, "audit_logs", rows.length, filters as Record<string, unknown>);
  return { filename: `audit_logs_${stamp()}.csv`, csv };
}

/** User directory without emails or contact data. */
export async function exportUsers(actor: Viewer, filters: { status: UserStatusFilter; q: string }) {
  assertPermission(actor, "users.export");
  if (filters.q.includes("@")) filters = { ...filters, q: "" };
  const rows = await collect((limit, offset) =>
    listUsers(actor, { ...filters, page: 1, pageSize: limit, offset, sort: "created_at", dir: "desc" }),
  );
  const csv = toCsv(rows, [
    { header: "user_id", value: (r) => r.id },
    { header: "display_name", value: (r) => r.displayName },
    { header: "university", value: (r) => r.universityName },
    { header: "email_verified_at", value: (r) => r.emailVerifiedAt },
    { header: "seller_enabled_at", value: (r) => r.sellerEnabledAt },
    { header: "joined_at", value: (r) => r.createdAt },
    { header: "active_restrictions", value: (r) => r.restrictionKinds.join(" ") },
    { header: "admin_roles", value: (r) => r.roles.join(" ") },
    { header: "listings", value: (r) => r.listingCount },
    { header: "open_reports_against", value: (r) => r.openReportCount },
  ]);
  await recordExport(actor, "users", rows.length, { status: filters.status, q: filters.q || null });
  return { filename: `users_${stamp()}.csv`, csv };
}
