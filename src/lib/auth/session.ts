import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { permissionsFor, type Permission } from "./permissions";

export type Restriction = {
  id: string;
  kind: Enums<"restriction_kind">;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
};

export type Viewer = {
  id: string;
  email: string;
  displayName: string;
  avatarPath: string | null;
  universityId: string;
  universityName: string;
  memberSince: string;
  emailVerified: boolean;
  /** University email verified and not suspended (AC-01). */
  isVerified: boolean;
  isSeller: boolean;
  canSell: boolean;
  canMessage: boolean;
  isSuspended: boolean;
  restrictions: Restriction[];
  roles: Enums<"app_role">[];
  /** Admin permissions from `user_roles` (empty while suspended). Display only: the console re-checks on the server and in the DB. */
  permissions: Permission[];
  /** Holds any console permission (shows the console link). */
  isStaff: boolean;
  /** Super Admin. */
  isAdmin: boolean;
  /** Epoch ms of the last interactive sign-in (JWT `amr`), used for the admin session age limit. */
  authenticatedAt: number | null;
};

/** Latest interactive authentication time from the verified JWT's `amr` claim (seconds → ms). */
function authTimeFromClaims(claims: { amr?: unknown }): number | null {
  if (!Array.isArray(claims.amr)) return null;
  const times = claims.amr
    .map((entry) => (entry && typeof entry === "object" && "timestamp" in entry ? Number(entry.timestamp) : NaN))
    .filter((t) => Number.isFinite(t) && t > 0);
  return times.length ? Math.max(...times) * 1000 : null;
}

/**
 * Data-access-layer entry point: the verified current user, or null. Deduplicated per request.
 * `getClaims()` verifies the JWT signature, so the user id is trustworthy here.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const userId = claims.sub;

  const [profileResult, rolesResult, restrictionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_path, university_id, email_verified_at, seller_enabled_at, created_at, universities(name)")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("account_restrictions")
      .select("id, kind, reason, expires_at, created_at")
      .eq("user_id", userId)
      .is("lifted_at", null),
  ]);

  const profile = profileResult.data;
  if (!profile) return null;

  const now = Date.now();
  const restrictions: Restriction[] = (restrictionsResult.data ?? [])
    .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .map((r) => ({ id: r.id, kind: r.kind, reason: r.reason, expiresAt: r.expires_at, createdAt: r.created_at }));
  const has = (kind: Restriction["kind"]) => restrictions.some((r) => r.kind === kind);

  const roles = (rolesResult.data ?? []).map((r) => r.role);
  const emailVerified = Boolean(profile.email_verified_at);
  const isSuspended = has("suspension");
  // Mirrors actor_has_permission(): a suspended account holds no admin permissions.
  const permissions = isSuspended ? [] : permissionsFor(roles);
  const isVerified = emailVerified && !isSuspended;
  const isSeller = Boolean(profile.seller_enabled_at);

  return {
    id: userId,
    email: typeof claims.email === "string" ? claims.email : "",
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
    universityId: profile.university_id,
    universityName: profile.universities?.name ?? "",
    memberSince: profile.created_at,
    emailVerified,
    isVerified,
    isSeller,
    canSell: isVerified && isSeller && !has("listing_ban"),
    canMessage: isVerified && !has("messaging_ban"),
    isSuspended,
    restrictions,
    roles,
    permissions,
    isStaff: permissions.includes("overview.view"),
    isAdmin: !isSuspended && roles.includes("super_admin"),
    authenticatedAt: authTimeFromClaims(claims),
  };
});

/** Pages: require a signed-in user (any verification state). */
export async function requireUser(nextPath?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return viewer;
}

/** Pages: require a verified, non-suspended student (AC-01). */
export async function requireVerified(nextPath?: string): Promise<Viewer> {
  const viewer = await requireUser(nextPath);
  if (!viewer.emailVerified) redirect("/verify-email");
  if (viewer.isSuspended) redirect("/account");
  return viewer;
}

/** Aliases matching the authorization vocabulary in docs/ADMIN_DATA_BOUNDARIES.md. */
export const requireAuthenticatedUser = requireUser;
export const requireVerifiedStudent = requireVerified;
