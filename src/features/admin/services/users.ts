import "server-only";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import type { Viewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { adminError, fromDbError } from "../errors";
import type { ListParams } from "../lib/list-params";

export const USER_STATUSES = ["all", "verified", "unverified", "sellers", "restricted", "suspended", "staff"] as const;
export type UserStatusFilter = (typeof USER_STATUSES)[number];
export const USER_SORTS = ["created_at", "display_name", "listings", "reports"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export type UserRow = {
  id: string;
  displayName: string;
  universityName: string;
  emailVerifiedAt: string | null;
  sellerEnabledAt: string | null;
  createdAt: string;
  restrictionKinds: string[];
  roles: string[];
  listingCount: number;
  openReportCount: number;
};

export type UserListResult = { rows: UserRow[]; total: number; notice?: string };

/**
 * User directory. Search by display name or user ID; an exact email address resolves to a user ID
 * only for roles holding users.view_contact (and that lookup is audited without storing the email).
 */
export async function listUsers(actor: Viewer, params: ListParams<UserSort> & { status: UserStatusFilter }): Promise<UserListResult> {
  assertPermission(actor, "users.view");
  let q: string | null = params.q || null;
  let notice: string | undefined;
  if (q?.includes("@")) {
    if (!hasPermission(actor, "users.view_contact")) {
      return { rows: [], total: 0, notice: "Your role can't search by email address. Search by name or user ID." };
    }
    const email = z.email().safeParse(q);
    if (!email.success) return { rows: [], total: 0, notice: "Enter a complete email address to look up an account." };
    const { data, error } = await createAdminClient().rpc("admin_find_user_by_email", { p_actor: actor.id, p_email: email.data });
    if (error) throw fromDbError(error);
    if (!data) return { rows: [], total: 0, notice: "No account uses that email address." };
    q = data;
    notice = "Showing the account that uses that email address (lookup recorded in the audit log).";
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_q: q,
    p_status: params.status,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.offset,
  });
  if (error) throw fromDbError(error);
  const rows = (data ?? []).map((r) => ({
    id: r.id!,
    displayName: r.display_name!,
    universityName: r.university_name ?? "",
    emailVerifiedAt: r.email_verified_at,
    sellerEnabledAt: r.seller_enabled_at,
    createdAt: r.created_at!,
    restrictionKinds: r.restriction_kinds ?? [],
    roles: r.roles ?? [],
    listingCount: r.listing_count ?? 0,
    openReportCount: r.open_report_count ?? 0,
  }));
  return { rows, total: data?.[0]?.total_count ?? 0, notice };
}

export async function getUserDetail(actor: Viewer, userId: string) {
  assertPermission(actor, "users.view");
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: user, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, email_verified_at, seller_enabled_at, created_at, updated_at, universities (name)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!user) return null;

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [restrictions, listings, reportsAgainst, reportsFiled, roles, events, privateInfo, appeals, deletion, conversations, recentListings] = await Promise.all([
    supabase.from("account_restrictions").select("id, kind, reason, expires_at, created_at, lifted_at, lift_reason").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("listings").select("id, title, status, moderation_status, expires_at, price_inr, created_at, updated_at").eq("seller_id", userId).order("updated_at", { ascending: false }).limit(50),
    supabase.from("reports").select("id, case_number, reason, status, target_type, severity, reporter_id, created_at").eq("reported_user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("reports").select("id, case_number, reason, status, target_type, created_at").eq("reporter_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("user_roles").select("role, granted_at").eq("user_id", userId),
    supabase.from("moderation_events").select("id, action, source, reason_codes, reason_text, rule_version, listing_id, report_id, created_at").eq("subject_user_id", userId).order("created_at", { ascending: false }).limit(50),
    // Owner-only table: read with the service role after the users.view check. The phone number itself is never returned.
    admin.from("profile_private").select("email_domain, contact_phone, terms_version, terms_accepted_at, seller_terms_accepted_at, age_confirmed_at").eq("id", userId).maybeSingle(),
    supabase.from("appeals").select("id, case_number, status, created_at, listing_id, restriction_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("account_deletion_requests").select("id, status, created_at, processed_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    // Conversation metadata only (counts), never message content.
    admin.from("conversations").select("id, created_at, buyer_id", { count: "exact" }).or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).order("created_at", { ascending: false }).limit(200),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", userId).gte("created_at", dayAgo),
  ]);

  const reportRows = reportsAgainst.data ?? [];
  const listingRows = listings.data ?? [];
  const conversationRows = conversations.data ?? [];
  const priv = privateInfo.data;
  return {
    user: { ...user, universityName: user.universities?.name ?? "" },
    private: priv
      ? {
          emailDomain: priv.email_domain,
          hasContactPhone: Boolean(priv.contact_phone),
          termsVersion: priv.terms_version,
          termsAcceptedAt: priv.terms_accepted_at,
          sellerTermsAcceptedAt: priv.seller_terms_accepted_at,
          ageConfirmedAt: priv.age_confirmed_at,
        }
      : null,
    restrictions: restrictions.data ?? [],
    listings: listingRows,
    reportsAgainst: reportRows,
    reportsFiled: reportsFiled.data ?? [],
    roles: (roles.data ?? []).map((r) => r.role),
    events: events.data ?? [],
    appeals: appeals.data ?? [],
    deletionRequests: deletion.data ?? [],
    signals: {
      listingsLast24h: recentListings.count ?? 0,
      blockedOrRemovedListings: listingRows.filter((l) => l.moderation_status === "blocked" || l.moderation_status === "removed").length,
      quarantinedListings: listingRows.filter((l) => l.moderation_status === "limited").length,
      distinctReporters: new Set(reportRows.map((r) => r.reporter_id).filter(Boolean)).size,
      openReportsAgainst: reportRows.filter((r) => r.status === "open" || r.status === "in_review" || r.status === "escalated").length,
      reportsFiled: (reportsFiled.data ?? []).length,
      conversations: conversations.count ?? conversationRows.length,
      conversationsStartedLast24h: conversationRows.filter((c) => c.buyer_id === userId && c.created_at >= dayAgo).length,
      enforcementEvents: (events.data ?? []).filter((e) => ["auto_blocked", "admin_removed", "admin_restricted", "report_auto_limited"].includes(e.action)).length,
      accountAgeDays: Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86_400_000),
    },
  };
}

export type UserDetail = NonNullable<Awaited<ReturnType<typeof getUserDetail>>>;

/** Account email and sign-in timestamps (users.view_contact). Each call writes `user.contact_viewed`. */
export async function getUserContact(actor: Viewer, userId: string) {
  assertPermission(actor, "users.view_contact");
  const { data, error } = await createAdminClient().rpc("admin_user_contact", { p_actor: actor.id, p_user: userId });
  if (error) throw fromDbError(error);
  const row = data?.[0];
  return row ? { email: row.email, emailConfirmedAt: row.email_confirmed_at, lastSignInAt: row.last_sign_in_at } : null;
}

export const restrictInput = z
  .object({
    userId: z.uuid(),
    kind: z.enum(["suspension", "listing_ban", "messaging_ban"]),
    reason: z.string().trim().min(3, "Record a reason (at least 3 characters).").max(1000),
    durationDays: z.coerce.number().int().min(0).max(3650).default(0),
    reportId: z.uuid().optional(),
    reportSummary: z.string().trim().min(3).max(1000).optional(),
  })
  .strict();

export async function restrictUser(actor: Viewer, input: z.infer<typeof restrictInput>) {
  assertPermission(actor, "users.restrict");
  if (input.userId === actor.id) throw adminError("CANNOT_TARGET_SELF");
  const { data, error } = await createAdminClient().rpc("admin_restrict_user", {
    p_actor: actor.id,
    p_user: input.userId,
    p_kind: input.kind as Enums<"restriction_kind">,
    p_reason: input.reason,
    p_duration_days: input.durationDays,
    p_report_id: input.reportId ?? null,
    p_report_summary: input.reportId ? (input.reportSummary ?? "Action was taken on the account.") : null,
  });
  if (error) throw fromDbError(error);
  return { restrictionId: data };
}

export const liftInput = z
  .object({ restrictionId: z.uuid(), reason: z.string().trim().min(3, "Record a reason (at least 3 characters).").max(1000) })
  .strict();

/** `expectedUserId` (API path parameter) must own the restriction; checked before anything changes. */
export async function liftRestriction(actor: Viewer, input: z.infer<typeof liftInput>, expectedUserId?: string) {
  assertPermission(actor, "users.restrict");
  const admin = createAdminClient();
  const { data } = await admin.from("account_restrictions").select("user_id").eq("id", input.restrictionId).maybeSingle();
  if (!data || (expectedUserId && data.user_id !== expectedUserId)) throw adminError("NOT_FOUND");
  const { error } = await admin.rpc("admin_lift_restriction", {
    p_actor: actor.id,
    p_restriction_id: input.restrictionId,
    p_reason: input.reason,
  });
  if (error) throw fromDbError(error);
  return { userId: data.user_id };
}
