import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformSettings } from "@/features/admin/settings";
import { adminError, type AdminError } from "@/features/admin/errors";
import { hasPermission, type Permission } from "./permissions";
import { getViewer, type Viewer } from "./session";

/**
 * Admin console authorization (docs/ADMIN_DATA_BOUNDARIES.md). Every console page, Server Action and
 * Route Handler goes through one of these. They read identity from the verified JWT and roles from
 * user_roles on every request; nothing here trusts client state. The database re-checks each
 * permission inside the admin_* functions.
 */

export type AdminSession =
  | { status: "ok"; actor: Viewer }
  | { status: "signed_out" }
  | { status: "not_staff"; viewer: Viewer }
  | { status: "expired"; viewer: Viewer };

/** Whether a session's last interactive sign-in is recent enough for the console. */
export function isAdminSessionFresh(authenticatedAt: number | null, maxHours: number, now = Date.now()) {
  return authenticatedAt !== null && now - authenticatedAt <= maxHours * 3_600_000 && authenticatedAt <= now + 60_000;
}

export const getAdminSession = cache(async (): Promise<AdminSession> => {
  const viewer = await getViewer();
  if (!viewer) return { status: "signed_out" };
  if (!hasPermission(viewer, "overview.view")) return { status: "not_staff", viewer };
  const { adminSessionMaxHours } = await getPlatformSettings();
  if (!isAdminSessionFresh(viewer.authenticatedAt, adminSessionMaxHours)) return { status: "expired", viewer };
  return { status: "ok", actor: viewer };
});

function loginPath(nextPath: string, reason?: "expired") {
  const params = new URLSearchParams({ next: nextPath });
  if (reason) params.set("reason", reason);
  return `/admin/login?${params}`;
}

/** Console pages: staff with a fresh session. Non-staff get a 404 so the console isn't advertised. */
export async function requireAdmin(nextPath = "/admin"): Promise<Viewer> {
  const session = await getAdminSession();
  if (session.status === "signed_out") redirect(loginPath(nextPath));
  if (session.status === "not_staff") notFound();
  if (session.status === "expired") redirect(loginPath(nextPath, "expired"));
  return session.actor;
}

/** Records a staff member's attempt to use a permission they don't hold (best effort). */
export async function recordDenied(actorId: string, action: string, permission: Permission, target?: { type: string; id?: string }) {
  try {
    await createAdminClient().rpc("admin_record_denied", {
      p_actor: actorId,
      p_action: action,
      p_permission: permission,
      p_target_type: target?.type,
      p_target_id: target?.id,
    });
  } catch {
    // Never block the response on the denial log.
  }
}

/** Console pages: a specific permission. Staff without it are sent to the overview with a notice. */
export async function requirePermission(permission: Permission, nextPath?: string): Promise<Viewer> {
  const actor = await requireAdmin(nextPath);
  if (!hasPermission(actor, permission)) {
    await recordDenied(actor.id, `page.${permission}`, permission);
    redirect(`/admin?denied=${encodeURIComponent(permission)}`);
  }
  return actor;
}

const RESOURCE_PERMISSIONS = {
  user: { view: "users.view", contact: "users.view_contact", restrict: "users.restrict", export: "users.export" },
  listing: { view: "listings.view", moderate: "listings.moderate" },
  report: { view: "reports.view", manage: "reports.manage", note: "reports.note", export: "reports.export" },
  appeal: { view: "appeals.view", resolve: "appeals.resolve" },
  conversation: { investigate: "messages.investigate" },
  category: { view: "config.view", manage: "categories.manage" },
  university: { view: "config.view", manage: "university.manage" },
  setting: { view: "config.view", manage: "settings.manage" },
  policy: { view: "moderation.view", manage: "moderation.manage" },
  role: { manage: "roles.manage" },
  audit: { view: "audit.view", export: "audit.export" },
  analytics: { view: "analytics.view", export: "analytics.export" },
  deletion: { view: "deletions.view", process: "deletions.process" },
} as const satisfies Record<string, Record<string, Permission>>;

export type AdminResource = keyof typeof RESOURCE_PERMISSIONS;
export type AdminResourceAction<R extends AdminResource> = keyof (typeof RESOURCE_PERMISSIONS)[R];

export function permissionFor<R extends AdminResource>(resource: R, action: AdminResourceAction<R>): Permission {
  return RESOURCE_PERMISSIONS[resource][action] as Permission;
}

/** Console pages: permission expressed as resource + action (e.g. `("listing", "moderate")`). */
export function requireResourceAccess<R extends AdminResource>(resource: R, action: AdminResourceAction<R>, nextPath?: string) {
  return requirePermission(permissionFor(resource, action), nextPath);
}

/**
 * Server Actions and Route Handlers: resolves the acting admin or an AdminError. Never redirects, so
 * it is safe to call from any server entry point.
 */
export async function authorizeAdmin(permission: Permission, action: string): Promise<{ actor: Viewer } | { error: AdminError }> {
  const session = await getAdminSession();
  if (session.status === "signed_out") return { error: adminError("UNAUTHENTICATED") };
  if (session.status === "not_staff") return { error: adminError("FORBIDDEN") };
  if (session.status === "expired") return { error: adminError("SESSION_EXPIRED") };
  if (!hasPermission(session.actor, permission)) {
    await recordDenied(session.actor.id, action, permission);
    return { error: adminError("FORBIDDEN") };
  }
  return { actor: session.actor };
}

/** Throws unless the actor holds the permission. Used inside domain services as a second check. */
export function assertPermission(actor: Viewer, permission: Permission) {
  if (!hasPermission(actor, permission)) throw adminError("FORBIDDEN");
}
