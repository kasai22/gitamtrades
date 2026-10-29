import "server-only";
import { assertPermission } from "@/lib/auth/admin";
import type { Viewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fromDbError } from "../errors";

export const AUDIT_OUTCOMES = ["success", "denied", "failed"] as const;
export const AUDIT_TARGET_TYPES = [
  "user", "listing", "listing_batch", "report", "appeal", "conversation", "category", "university", "university_domain",
  "meetup_area", "setting", "policy", "post", "comment", "deletion_request", "export", "permission", "session",
] as const;

export type AuditFilters = {
  action?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  outcome?: (typeof AUDIT_OUTCOMES)[number];
  from?: string;
  to?: string;
};

/** Audit trail (audit.view, enforced again by RLS). Newest first; `action` matches as a prefix. */
export async function listAuditLogs(actor: Viewer, filters: AuditFilters, page: { limit: number; offset: number }) {
  assertPermission(actor, "audit.view");
  const supabase = await createClient();
  let query = supabase
    .from("admin_audit_logs")
    .select("id, actor_id, actor_roles, action, target_type, target_id, reason, before, after, metadata, outcome, created_at, actor:profiles!admin_audit_logs_actor_id_fkey (display_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page.offset, page.offset + page.limit - 1);
  if (filters.action) query = query.like("action", `${filters.action.replace(/[%_\\]/g, "")}%`);
  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.targetType) query = query.eq("target_type", filters.targetType);
  if (filters.targetId) query = query.eq("target_id", filters.targetId);
  if (filters.outcome) query = query.eq("outcome", filters.outcome);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00+05:30`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999+05:30`);
  const { data, error, count } = await query;
  if (error) throw fromDbError(error);
  return { rows: data ?? [], total: count ?? 0 };
}
