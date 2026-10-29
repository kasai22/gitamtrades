"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { permissionsFor } from "@/lib/auth/permissions";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { audit } from "./audit";

export type AdminSignInState = { error?: string; email?: string } | null;

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) });

/** One message for every failure so the form can't be used to discover accounts or staff. */
const GENERIC = "Those credentials can't be used to sign in to the admin console.";

/** Only console paths are valid destinations after admin sign-in. */
function consolePath(next: unknown) {
  const path = safeNextPath(typeof next === "string" ? next : null, "/admin");
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin?") ? (path.startsWith("/admin/login") ? "/admin" : path) : "/admin";
}

/**
 * Admin console sign-in. Reuses Supabase Auth (same provider and credentials as the marketplace),
 * then admits only accounts that hold console access. Anyone else is signed out again.
 */
export async function adminSignIn(_prev: AdminSignInState, formData: FormData): Promise<AdminSignInState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Enter your email and password.", email: raw.email ?? "" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.status === 429) return { error: "Too many sign-in attempts. Wait a few minutes and try again.", email: parsed.data.email };
    return { error: GENERIC, email: parsed.data.email };
  }

  const userId = data.user.id;
  const [{ data: roles }, { data: restrictions }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("account_restrictions").select("kind, expires_at").eq("user_id", userId).eq("kind", "suspension").is("lifted_at", null),
  ]);
  const suspended = (restrictions ?? []).some((r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now());
  const permissions = suspended ? [] : permissionsFor((roles ?? []).map((r) => r.role));
  if (!permissions.includes("overview.view")) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: GENERIC, email: parsed.data.email };
  }

  await audit({ actorId: userId, action: "admin.signed_in", targetType: "session", targetId: userId });
  redirect(consolePath(raw.next));
}
