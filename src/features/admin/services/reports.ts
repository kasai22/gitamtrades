import "server-only";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/admin";
import { ROLE_PERMISSIONS, type AdminRole } from "@/lib/auth/permissions";
import type { Viewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Json } from "@/types/database";
import { REPORT_REASON_VALUES } from "@/features/moderation/report-reasons";
import { fromDbError } from "../errors";
import type { ListParams } from "../lib/list-params";

export const REPORT_STATUS_FILTERS = ["active", "open", "in_review", "escalated", "closed", "actioned", "dismissed", "resolved", "all"] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];
export const REPORT_STATUSES = ["open", "in_review", "escalated", "actioned", "dismissed", "resolved"] as const;
export const CLOSED_REPORT_STATUSES = ["actioned", "dismissed", "resolved"] as const;
export const REPORT_TARGETS = ["listing", "user", "message", "post", "comment"] as const;
export const REPORT_SORTS = ["priority", "created_at", "updated_at", "severity"] as const;
export type ReportSort = (typeof REPORT_SORTS)[number];

export const RESOLUTION_CODES = [
  { value: "content_removed", label: "Content removed" },
  { value: "account_restricted", label: "Account restricted" },
  { value: "warning_issued", label: "Warning issued" },
  { value: "no_violation", label: "No violation found" },
  { value: "insufficient_evidence", label: "Insufficient evidence" },
  { value: "duplicate", label: "Duplicate report" },
  { value: "referred", label: "Referred (legal/compliance)" },
  { value: "other", label: "Other" },
] as const;
export type ResolutionCode = (typeof RESOLUTION_CODES)[number]["value"];

export const PRIORITY_LABELS: Record<number, string> = { 1: "Low", 2: "Normal", 3: "High", 4: "Urgent" };

export type ReportRow = {
  id: string;
  caseNumber: string;
  targetType: Enums<"report_target">;
  reason: Enums<"report_reason">;
  severity: number;
  priority: number;
  status: Enums<"report_status">;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  reporterName: string | null;
  targetLabel: string | null;
  listingId: string | null;
  reportedUserId: string | null;
  resolutionCode: string | null;
};

export type ReportFilters = {
  status: ReportStatusFilter;
  priority?: number;
  severity?: number;
  reason?: string;
  target?: string;
  assignee?: string;
};

export async function listReports(actor: Viewer, params: ListParams<ReportSort> & ReportFilters): Promise<{ rows: ReportRow[]; total: number }> {
  assertPermission(actor, "reports.view");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_reports", {
    p_q: params.q || null,
    p_status: params.status,
    p_priority: params.priority ?? null,
    p_severity: params.severity ?? null,
    p_reason: params.reason ?? null,
    p_target: params.target ?? null,
    p_assignee: params.assignee ?? null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.offset,
  });
  if (error) throw fromDbError(error);
  const rows = (data ?? []).map((r) => ({
    id: r.id!,
    caseNumber: r.case_number!,
    targetType: r.target_type!,
    reason: r.reason!,
    severity: r.severity ?? 1,
    priority: r.priority ?? 2,
    status: r.status!,
    createdAt: r.created_at!,
    updatedAt: r.updated_at!,
    resolvedAt: r.resolved_at,
    assignedTo: r.assigned_to,
    assigneeName: r.assignee_name,
    reporterName: r.reporter_name,
    targetLabel: r.target_label,
    listingId: r.listing_id,
    reportedUserId: r.reported_user_id,
    resolutionCode: r.resolution_code,
  }));
  return { rows, total: data?.[0]?.total_count ?? 0 };
}

/** Staff who may be assigned a report (anyone holding reports.view, not suspended). */
export async function listAssignableStaff(actor: Viewer) {
  assertPermission(actor, "reports.manage");
  const roles = (Object.keys(ROLE_PERMISSIONS) as AdminRole[]).filter((r) => ROLE_PERMISSIONS[r].includes("reports.view"));
  const admin = createAdminClient();
  const { data } = await admin.from("user_roles").select("user_id, role, profiles!user_roles_user_id_fkey (display_name)").in("role", roles);
  const ids = [...new Set((data ?? []).map((r) => r.user_id))];
  if (!ids.length) return [];
  const { data: suspended } = await admin
    .from("account_restrictions")
    .select("user_id, expires_at")
    .in("user_id", ids)
    .eq("kind", "suspension")
    .is("lifted_at", null);
  const now = Date.now();
  const blocked = new Set((suspended ?? []).filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now).map((s) => s.user_id));
  const byId = new Map<string, string>();
  for (const row of data ?? []) if (!blocked.has(row.user_id)) byId.set(row.user_id, row.profiles?.display_name ?? "Staff");
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getReportDetail(actor: Viewer, reportId: string) {
  assertPermission(actor, "reports.view");
  const supabase = await createClient();
  const { data: report, error } = await supabase
    .from("reports")
    .select(
      `id, case_number, target_type, reason, details, severity, priority, status, evidence, resolution_summary, resolution_code,
       created_at, updated_at, resolved_at, assigned_to, assigned_at,
       listing_id, reported_user_id, message_id, post_id, comment_id,
       forum_posts (id, title, moderation_status),
       listings (id, title, status, moderation_status),
       reported:profiles!reports_reported_user_id_fkey (id, display_name),
       reporter:profiles!reports_reporter_id_fkey (id, display_name),
       assignee:profiles!reports_assigned_to_fkey (id, display_name),
       resolver:profiles!reports_resolved_by_fkey (id, display_name)`,
    )
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!report) return null;

  const relatedFilter = report.listing_id
    ? { column: "listing_id" as const, value: report.listing_id }
    : report.reported_user_id
      ? { column: "reported_user_id" as const, value: report.reported_user_id }
      : null;
  const admin = createAdminClient();
  const [notes, related, history, conversation] = await Promise.all([
    supabase.from("report_notes").select("id, body, created_at, author:profiles!report_notes_author_id_fkey (display_name)").eq("report_id", reportId).order("created_at"),
    relatedFilter
      ? supabase.from("reports").select("id, case_number, reason, status, severity, created_at").eq(relatedFilter.column, relatedFilter.value).neq("id", reportId).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as { id: string; case_number: string; reason: Enums<"report_reason">; status: Enums<"report_status">; severity: number; created_at: string }[] }),
    supabase
      .from("moderation_events")
      .select("id, action, source, reason_codes, reason_text, created_at, actor:profiles!moderation_events_actor_id_fkey (display_name)")
      .or(`report_id.eq.${report.id}${report.listing_id ? `,listing_id.eq.${report.listing_id}` : ""}`)
      .order("created_at", { ascending: false })
      .limit(30),
    // Which conversation (if any) a message report belongs to: metadata only.
    report.message_id ? admin.from("messages").select("conversation_id").eq("id", report.message_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    report,
    evidence: (report.evidence ?? {}) as Record<string, Json>,
    notes: notes.data ?? [],
    related: related.data ?? [],
    history: history.data ?? [],
    conversationId: (conversation.data as { conversation_id: string } | null)?.conversation_id ?? null,
  };
}

export type ReportDetail = NonNullable<Awaited<ReturnType<typeof getReportDetail>>>;

export const reportPatchInput = z
  .object({
    status: z.enum(REPORT_STATUSES).optional(),
    priority: z.coerce.number().int().min(1).max(4).optional(),
    assignedTo: z.uuid().nullable().optional(),
    resolutionCode: z.enum(RESOLUTION_CODES.map((c) => c.value) as [ResolutionCode, ...ResolutionCode[]]).optional(),
    summary: z.string().trim().max(1000).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change.");

export async function updateReport(actor: Viewer, reportId: string, patch: z.infer<typeof reportPatchInput>) {
  assertPermission(actor, "reports.manage");
  const body: Record<string, Json> = {};
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.assignedTo !== undefined) body.assigned_to = patch.assignedTo;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.resolutionCode !== undefined) body.resolution_code = patch.resolutionCode;
  if (patch.summary) body.summary = patch.summary;
  if (patch.reason) body.reason = patch.reason;
  const { error } = await createAdminClient().rpc("admin_update_report", { p_actor: actor.id, p_report_id: reportId, p_patch: body });
  if (error) throw fromDbError(error);
}

export const noteInput = z.object({ note: z.string().trim().min(2, "Write a note.").max(2000) }).strict();

export async function addReportNote(actor: Viewer, reportId: string, note: string) {
  assertPermission(actor, "reports.note");
  const { data, error } = await createAdminClient().rpc("admin_add_report_note", { p_actor: actor.id, p_report_id: reportId, p_body: note });
  if (error) throw fromDbError(error);
  return { noteId: data };
}

export const REPORT_REASON_FILTERS = REPORT_REASON_VALUES;
