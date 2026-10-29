import "server-only";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/admin";
import { ADMIN_ROLES, type AdminRole } from "@/lib/auth/permissions";
import type { Viewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminError, fromDbError } from "../errors";

export async function listStaff(actor: Viewer) {
  assertPermission(actor, "roles.manage");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_roles")
    .select("user_id, role, granted_at, granted_by, profile:profiles!user_roles_user_id_fkey (id, display_name, email_verified_at), granter:profiles!user_roles_granted_by_fkey (display_name)")
    .order("granted_at");
  if (error) throw fromDbError(error);
  const ids = [...new Set((data ?? []).map((r) => r.user_id))];
  const { data: suspensions } = ids.length
    ? await admin.from("account_restrictions").select("user_id, expires_at").in("user_id", ids).eq("kind", "suspension").is("lifted_at", null)
    : { data: [] as { user_id: string; expires_at: string | null }[] };
  const now = Date.now();
  const suspended = new Set((suspensions ?? []).filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now).map((s) => s.user_id));

  const staff = new Map<string, { id: string; name: string; suspended: boolean; roles: { role: AdminRole; grantedAt: string; grantedBy: string | null }[] }>();
  for (const row of data ?? []) {
    const entry = staff.get(row.user_id) ?? { id: row.user_id, name: row.profile?.display_name ?? "Deleted account", suspended: suspended.has(row.user_id), roles: [] };
    entry.roles.push({ role: row.role as AdminRole, grantedAt: row.granted_at, grantedBy: row.granter?.display_name ?? null });
    staff.set(row.user_id, entry);
  }
  return [...staff.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const roleInput = z
  .object({
    userId: z.uuid(),
    role: z.enum(ADMIN_ROLES),
    grant: z.boolean(),
    reason: z.string().trim().min(3, "Record a reason (at least 3 characters).").max(500),
  })
  .strict();

export async function setRole(actor: Viewer, input: z.infer<typeof roleInput>) {
  assertPermission(actor, "roles.manage");
  if (input.userId === actor.id) throw adminError("CANNOT_TARGET_SELF", "You can't change your own roles. Ask another Super Admin.");
  const { error } = await createAdminClient().rpc("admin_set_role", {
    p_actor: actor.id,
    p_user: input.userId,
    p_role: input.role,
    p_grant: input.grant,
    p_reason: input.reason,
  });
  if (error) throw fromDbError(error);
}
