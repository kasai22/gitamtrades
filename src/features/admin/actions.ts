"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { authorizeAdmin } from "@/lib/auth/admin";
import type { Permission } from "@/lib/auth/permissions";
import type { Viewer } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { audit } from "./audit";
import { adminError, fromDbError, toAdminError } from "./errors";
import * as config from "./services/config";
import * as conversations from "./services/conversations";
import * as listings from "./services/listings";
import * as reports from "./services/reports";
import * as roles from "./services/roles";
import * as users from "./services/users";

/**
 * Admin Server Actions. Each one: (1) authorizes the caller from the session and user_roles,
 * (2) validates input with a strict Zod schema, (3) calls a domain service that re-checks the
 * permission and runs an audited admin_* database function, (4) revalidates affected pages.
 */
async function run<S extends z.ZodType, T>(
  permission: Permission,
  action: string,
  schema: S,
  input: unknown,
  fn: (actor: Viewer, data: z.infer<S>) => Promise<T>,
  options: { revalidate?: (data: z.infer<S>, result: T) => string[]; message?: string | ((result: T) => string) } = {},
): Promise<ActionResult<T>> {
  const auth = await authorizeAdmin(permission, action);
  if ("error" in auth) return fail(auth.error.message);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
  try {
    const result = await fn(auth.actor, parsed.data);
    for (const path of options.revalidate?.(parsed.data, result) ?? []) revalidatePath(path);
    const message = typeof options.message === "function" ? options.message(result) : options.message;
    return ok(result, message);
  } catch (error) {
    return fail(toAdminError(error).message);
  }
}

const uuid = z.uuid();

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export async function updateReport(reportId: string, patch: z.input<typeof reports.reportPatchInput>) {
  return run("reports.manage", "report.update", z.object({ reportId: uuid, patch: reports.reportPatchInput }), { reportId, patch }, (actor, d) => reports.updateReport(actor, d.reportId, d.patch), {
    revalidate: (d) => ["/admin", "/admin/reports", `/admin/reports/${d.reportId}`],
    message: "Report updated.",
  });
}

export async function addReportNote(reportId: string, note: string) {
  return run("reports.note", "report.note", z.object({ reportId: uuid, note: reports.noteInput.shape.note }), { reportId, note }, (actor, d) => reports.addReportNote(actor, d.reportId, d.note), {
    revalidate: (d) => [`/admin/reports/${d.reportId}`],
    message: "Note added.",
  });
}

// ---------------------------------------------------------------------------
// Listings (single and bulk)
// ---------------------------------------------------------------------------
export async function moderateListings(input: z.input<typeof listings.moderateInput>) {
  return run("listings.moderate", `listing.${input?.action ?? "moderate"}`, listings.moderateInput, input, async (actor, d) => {
    const result = await listings.moderateListings(actor, d);
    track("moderation_action", actor.id, { action: `listing_${d.action}`, target_type: d.listingIds.length > 1 ? "listing_batch" : "listing" });
    return result;
  }, {
    revalidate: (d) => ["/admin", "/admin/listings", "/marketplace", ...d.listingIds.flatMap((id) => [`/admin/listings/${id}`, `/listings/${id}`]), ...(d.reportId ? [`/admin/reports/${d.reportId}`] : [])],
    message: (r) => (r.updated === 0 ? "No listings needed changing." : `Updated ${r.updated} listing${r.updated === 1 ? "" : "s"}.`),
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export async function restrictUser(input: z.input<typeof users.restrictInput>) {
  return run("users.restrict", `user.restrict.${input?.kind ?? ""}`, users.restrictInput, input, async (actor, d) => {
    const result = await users.restrictUser(actor, d);
    track("moderation_action", actor.id, { action: `restrict_${d.kind}`, target_type: "user" });
    return result;
  }, {
    revalidate: (d) => ["/admin", "/admin/users", `/admin/users/${d.userId}`, ...(d.reportId ? [`/admin/reports/${d.reportId}`] : [])],
    message: "Restriction applied.",
  });
}

export async function liftRestriction(input: z.input<typeof users.liftInput>) {
  return run("users.restrict", "user.restriction_lifted", users.liftInput, input, (actor, d) => users.liftRestriction(actor, d), {
    revalidate: (_d, r) => ["/admin/users", ...(r.userId ? [`/admin/users/${r.userId}`] : [])],
    message: "Restriction lifted.",
  });
}

/** Reveals an account email to roles with users.view_contact. Recorded as `user.contact_viewed`. */
export async function revealUserContact(userId: string) {
  return run("users.view_contact", "user.contact_viewed", uuid, userId, (actor, id) => users.getUserContact(actor, id));
}

export async function setUserRole(input: z.input<typeof roles.roleInput>) {
  return run("roles.manage", input?.grant ? "role.granted" : "role.revoked", roles.roleInput, input, (actor, d) => roles.setRole(actor, d), {
    revalidate: (d) => ["/admin/roles", `/admin/users/${d.userId}`],
    message: () => (input.grant ? "Role granted." : "Role revoked."),
  });
}

// ---------------------------------------------------------------------------
// Appeals (SAFE-04): overturning reverses the original action in the same transaction.
// ---------------------------------------------------------------------------
const appealInput = z.object({ appealId: uuid, decision: z.enum(["upheld", "overturned"]), summary: z.string().trim().min(3, "Write a summary for the student.").max(1000) }).strict();

export async function resolveAppeal(input: z.input<typeof appealInput>) {
  return run("appeals.resolve", `appeal.${input?.decision ?? ""}`, appealInput, input, async (actor, d) => {
    const { error } = await createAdminClient().rpc("admin_resolve_appeal", { p_actor: actor.id, p_appeal_id: d.appealId, p_decision: d.decision, p_summary: d.summary });
    if (error) throw fromDbError(error);
    track("moderation_action", actor.id, { action: `appeal_${d.decision}`, target_type: "appeal" });
  }, { revalidate: () => ["/admin", "/admin/appeals"], message: "Appeal resolved." });
}

// ---------------------------------------------------------------------------
// Conversations (messages.investigate)
// ---------------------------------------------------------------------------
export async function requestConversationAccess(input: z.input<typeof conversations.accessInput>) {
  return run("messages.investigate", "conversation.access_granted", conversations.accessInput, input, (actor, d) => conversations.grantConversationAccess(actor, d), {
    revalidate: (d) => [`/admin/messages/${d.conversationId}`],
    message: "Access recorded. It expires in 30 minutes.",
  });
}

export async function restrictConversation(input: z.input<typeof conversations.restrictConversationInput>) {
  return run("messages.investigate", input?.restrict ? "conversation.restricted" : "conversation.unrestricted", conversations.restrictConversationInput, input, (actor, d) => conversations.restrictConversation(actor, d), {
    revalidate: (d) => [`/admin/messages/${d.conversationId}`, "/admin/messages"],
    message: () => (input.restrict ? "Conversation restricted." : "Conversation restored."),
  });
}

// ---------------------------------------------------------------------------
// Categories, university, settings, policy (Super Admin by default)
// ---------------------------------------------------------------------------
export async function saveCategory(input: z.input<typeof config.categoryInput>) {
  return run("categories.manage", input?.id ? "category.updated" : "category.created", config.categoryInput, input, (actor, d) => config.saveCategory(actor, d), {
    revalidate: () => ["/admin/categories", "/marketplace", "/sell"],
    message: () => (input.id ? "Category saved." : "Category created."),
  });
}

export async function reorderCategories(ids: string[]) {
  return run("categories.manage", "category.reordered", z.array(uuid).min(1).max(200), ids, (actor, d) => config.reorderCategories(actor, d), {
    revalidate: () => ["/admin/categories", "/marketplace"],
    message: "Order saved.",
  });
}

export async function deleteCategory(id: string) {
  return run("categories.manage", "category.deleted", uuid, id, (actor, d) => config.deleteCategory(actor, d), {
    revalidate: () => ["/admin/categories"],
    message: "Category deleted.",
  });
}

export async function updateUniversity(input: z.input<typeof config.universityInput>) {
  return run("university.manage", "university.updated", config.universityInput, input, (actor, d) => config.updateUniversity(actor, d), {
    revalidate: () => ["/admin/universities"],
    message: "University details saved.",
  });
}

export async function addUniversityDomain(input: z.input<typeof config.domainInput>) {
  return run("university.manage", "domain.added", config.domainInput, input, (actor, d) => config.addDomain(actor, d), {
    revalidate: () => ["/admin/universities"],
    message: "Domain added.",
  });
}

export async function setUniversityDomainActive(input: z.input<typeof config.domainActiveInput>) {
  return run("university.manage", input?.active ? "domain.activated" : "domain.deactivated", config.domainActiveInput, input, (actor, d) => config.setDomainActive(actor, d), {
    revalidate: () => ["/admin/universities"],
    message: () => (input.active ? "Domain enabled." : "Domain disabled."),
  });
}

export async function addMeetupArea(input: z.input<typeof config.meetupInput>) {
  return run("university.manage", "meetup_area.added", config.meetupInput, input, (actor, d) => config.addMeetupArea(actor, d), {
    revalidate: () => ["/admin/universities"],
    message: "Meetup area added.",
  });
}

export async function setMeetupAreaActive(areaId: string, active: boolean) {
  return run("university.manage", "meetup_area.updated", z.object({ areaId: uuid, active: z.boolean() }), { areaId, active }, (actor, d) => config.setMeetupAreaActive(actor, d.areaId, d.active), {
    revalidate: () => ["/admin/universities"],
  });
}

export async function updateSetting(input: z.input<typeof config.settingInput>) {
  return run("settings.manage", "setting.updated", config.settingInput, input, (actor, d) => config.updateSetting(actor, d), {
    revalidate: () => ["/admin/settings"],
    message: "Setting saved.",
  });
}

export async function createPolicyVersion(input: z.input<typeof config.policyInput>) {
  return run("moderation.manage", "policy.version_created", config.policyInput, input, (actor, d) => config.createPolicyVersion(actor, d), {
    revalidate: () => ["/admin/moderation"],
    message: (r) => (input.activate ? `Policy v${r.version} is now active.` : `Saved policy v${r.version}.`),
  });
}

export async function activatePolicyVersion(policyId: string) {
  return run("moderation.manage", "policy.activated", uuid, policyId, (actor, id) => config.activatePolicyVersion(actor, id), {
    revalidate: () => ["/admin/moderation"],
    message: (r) => `Policy v${r.version} is now active.`,
  });
}

// ---------------------------------------------------------------------------
// Account deletion (AUTH-04). Calls the Auth admin API, so it can't run in one SQL transaction:
// the request is marked first and rolled back if the deletion fails.
// ---------------------------------------------------------------------------
export async function processDeletionRequest(requestId: string, decision: "complete" | "cancel") {
  return run("deletions.process", `account_deletion.${decision}`, z.object({ requestId: uuid, decision: z.enum(["complete", "cancel"]) }), { requestId, decision }, async (actor, d) => {
    const admin = createAdminClient();
    const { data: request } = await admin.from("account_deletion_requests").select("id, user_id, status").eq("id", d.requestId).maybeSingle();
    if (!request || request.status !== "pending") throw adminError("INVALID_REQUEST", "This request isn't pending.");
    if (request.user_id === actor.id) throw adminError("CANNOT_TARGET_SELF");

    const { error: updateError } = await admin
      .from("account_deletion_requests")
      .update({ status: d.decision === "complete" ? "completed" : "cancelled", processed_at: new Date().toISOString(), processed_by: actor.id })
      .eq("id", d.requestId);
    if (updateError) throw fromDbError(updateError);

    if (d.decision === "complete" && request.user_id) {
      // Remove stored files first (storage objects are not cascaded by Postgres).
      for (const bucket of ["listing-images", "avatars"]) {
        const { data: files } = await admin.storage.from(bucket).list(request.user_id, { limit: 1000 });
        if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${request.user_id}/${f.name}`));
      }
      const { error } = await admin.auth.admin.deleteUser(request.user_id);
      if (error) {
        await admin.from("account_deletion_requests").update({ status: "pending", processed_at: null, processed_by: null }).eq("id", d.requestId);
        await audit({ actorId: actor.id, action: "account_deletion.complete", targetType: "deletion_request", targetId: d.requestId, outcome: "failed", metadata: { error: error.message.slice(0, 200) } });
        // LAST_SUPER_ADMIN surfaces here when the account is the only Super Admin.
        throw fromDbError(error);
      }
    }
    await audit({ actorId: actor.id, action: `account_deletion.${d.decision}`, targetType: "deletion_request", targetId: d.requestId });
  }, {
    revalidate: () => ["/admin/deletion-requests", "/admin"],
    message: () => (decision === "complete" ? "Account deleted." : "Request cancelled."),
  });
}

// ---------------------------------------------------------------------------
// Community moderation (posts and comments)
// ---------------------------------------------------------------------------
const communitySchema = z
  .object({
    target: z.enum(["post", "comment"]),
    id: uuid,
    action: z.enum(["remove", "restore", "lock", "unlock", "pin", "unpin"]),
    reason: z.string().trim().max(1000).default(""),
    reportId: uuid.optional(),
  })
  .strict();

export async function moderateCommunity(input: z.input<typeof communitySchema>) {
  return run("community.moderate", `community.${input?.action ?? ""}`, communitySchema, input, async (actor, d) => {
    const { target, id, action, reportId } = d;
    const note = d.reason;
    if ((action === "remove" || action === "restore") && note.length < 3) throw adminError("REASON_REQUIRED");
    if (target === "comment" && !["remove", "restore"].includes(action)) throw adminError("INVALID_REQUEST", "Only posts can be locked or pinned.");

    const admin = createAdminClient();
    const ids = target === "post" ? { forum_post_id: id } : { forum_comment_id: id };
    if (reportId) {
      // A linked report must be about this post or comment (it is closed by the removal).
      const { data: linked } = await admin.from("reports").select("post_id, comment_id").eq("id", reportId).maybeSingle();
      if (!linked || (target === "post" ? linked.post_id !== id : linked.comment_id !== id)) throw adminError("REPORT_MISMATCH");
    }

    if (action === "lock" || action === "unlock" || action === "pin" || action === "unpin") {
      const patch = action === "lock" || action === "unlock" ? { is_locked: action === "lock" } : { is_pinned: action === "pin" };
      const { error } = await admin.from("forum_posts").update(patch).eq("id", id);
      if (error) throw fromDbError(error);
      await audit({ actorId: actor.id, action: `community.${action}`, targetType: "post", targetId: id, reason: note || null, after: patch });
      return { postId: id };
    }

    const { data: row } =
      target === "post"
        ? await admin.from("forum_posts").select("id, title, body, author_id, moderation_status").eq("id", id).maybeSingle()
        : await admin.from("forum_comments").select("id, body, author_id, moderation_status, post_id").eq("id", id).maybeSingle();
    if (!row) throw adminError("NOT_FOUND");
    const postId = "post_id" in row ? (row.post_id as string) : id;

    if (action === "remove") {
      // Keep the original text in the staff-only moderation log so a successful appeal can restore it.
      const original = { title: "title" in row ? row.title : null, body: row.body };
      const { error } =
        target === "post"
          ? await admin.from("forum_posts").update({ moderation_status: "removed", moderation_source: "admin", title: "[removed]", body: "" }).eq("id", id)
          : await admin.from("forum_comments").update({ moderation_status: "removed", moderation_source: "admin", body: "" }).eq("id", id);
      if (error) throw fromDbError(error);
      await admin.from("moderation_events").insert({
        ...ids,
        ...(target === "comment" ? { forum_post_id: postId } : {}),
        subject_user_id: row.author_id,
        report_id: reportId ?? null,
        action: "admin_removed",
        source: "admin",
        actor_id: actor.id,
        reason_text: note,
        metadata: { original } as Json,
      });
      if (reportId) {
        await createAdminClient().rpc("admin_update_report", {
          p_actor: actor.id,
          p_report_id: reportId,
          p_patch: { status: "actioned", resolution_code: "content_removed", summary: "The content was removed." },
        });
      }
    } else {
      let restored: { title?: string; body: string } | null = null;
      if (row.moderation_status === "removed") {
        const { data: event } = await admin
          .from("moderation_events")
          .select("metadata")
          .eq(target === "post" ? "forum_post_id" : "forum_comment_id", id)
          .eq("action", "admin_removed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const original = (event?.metadata as { original?: { title?: string | null; body?: string } } | null)?.original;
        if (!original?.body && !original?.title) throw adminError("INVALID_REQUEST", "The original text isn't available, so this can't be restored.");
        restored = { ...(target === "post" && original.title ? { title: original.title } : {}), body: original.body ?? "" };
      }
      const base = { moderation_status: "clear" as const, moderation_source: "admin" as const, moderation_reasons: [] as Json };
      const { error } =
        target === "post"
          ? await admin.from("forum_posts").update({ ...base, ...(restored ?? {}) }).eq("id", id)
          : await admin.from("forum_comments").update({ ...base, ...(restored ? { body: restored.body } : {}) }).eq("id", id);
      if (error) throw fromDbError(error);
      await admin.from("moderation_events").insert({
        ...ids,
        ...(target === "comment" ? { forum_post_id: postId } : {}),
        subject_user_id: row.author_id,
        report_id: reportId ?? null,
        action: "admin_restored",
        source: "admin",
        actor_id: actor.id,
        reason_text: note,
      });
    }
    await audit({ actorId: actor.id, action: `community.${target}.${action}`, targetType: target, targetId: id, reason: note });
    track("moderation_action", actor.id, { action: `community_${action}`, target_type: target });
    return { postId };
  }, {
    revalidate: (_d, r) => ["/admin/community", `/community/${r.postId}`, "/community"],
    message: () => (input.action === "remove" ? "Removed." : input.action === "restore" ? "Restored." : "Post updated."),
  });
}
