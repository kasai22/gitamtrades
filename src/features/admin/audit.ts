import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/**
 * ADMIN-01 / §9.2: privileged actions are recorded through admin_write_audit() (append-only table).
 * Most admin mutations write their audit record inside the same database transaction; this helper is
 * for the few actions that don't run in SQL (sign-in, account deletion, community moderation).
 * Never pass passwords, tokens, message bodies or email addresses.
 */
export async function audit(entry: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  before?: Json;
  after?: Json;
  metadata?: Json;
  outcome?: "success" | "denied" | "failed";
}) {
  const { error } = await createAdminClient().rpc("admin_write_audit", {
    p_actor: entry.actorId,
    p_action: entry.action,
    p_target_type: entry.targetType,
    p_target_id: entry.targetId ?? null,
    p_reason: entry.reason ?? null,
    p_before: entry.before ?? null,
    p_after: entry.after ?? null,
    p_metadata: entry.metadata ?? {},
    p_outcome: entry.outcome ?? "success",
  });
  if (error) throw new Error(`Audit log write failed: ${error.message}`);
}
