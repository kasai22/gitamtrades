import "server-only";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/admin";
import type { Viewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fromDbError } from "../errors";

/**
 * Reported-conversation investigation (messages.investigate). Search and metadata never include
 * message text. Reading messages requires a documented, time-limited grant created by
 * admin_grant_conversation_access(); every read is audited by admin_conversation_messages().
 */

export type ConversationRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  createdAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  reportCount: number;
  restrictedAt: string | null;
};

export async function searchConversations(actor: Viewer, q: string, page: { limit: number; offset: number }) {
  assertPermission(actor, "messages.investigate");
  if (!q.trim()) return { rows: [] as ConversationRow[], total: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_search_conversations", { p_q: q.trim(), p_limit: page.limit, p_offset: page.offset });
  if (error) throw fromDbError(error);
  const rows = (data ?? []).map((r) => ({
    id: r.id!,
    listingId: r.listing_id!,
    listingTitle: r.listing_title ?? "",
    buyerId: r.buyer_id!,
    buyerName: r.buyer_name ?? "",
    sellerId: r.seller_id!,
    sellerName: r.seller_name ?? "",
    createdAt: r.created_at!,
    lastMessageAt: r.last_message_at,
    messageCount: r.message_count ?? 0,
    reportCount: r.report_count ?? 0,
    restrictedAt: r.restricted_at,
  }));
  return { rows, total: data?.[0]?.total_count ?? 0 };
}

/** Conversation metadata, linked reports and the actor's current access grant (no message text). */
export async function getConversationMeta(actor: Viewer, conversationId: string) {
  assertPermission(actor, "messages.investigate");
  const { rows } = await searchConversations(actor, conversationId, { limit: 1, offset: 0 });
  const conversation = rows.find((r) => r.id === conversationId);
  if (!conversation) return null;
  const admin = createAdminClient();
  const [reports, grant] = await Promise.all([
    admin
      .from("reports")
      .select("id, case_number, reason, status, created_at, message_id, reporter_id, reported_user_id, messages!inner (conversation_id)")
      .eq("messages.conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("conversation_access_grants")
      .select("id, reason, expires_at, created_at, report_id")
      .eq("actor_id", actor.id)
      .eq("conversation_id", conversationId)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const { data: userReports } = await admin
    .from("reports")
    .select("id, case_number, reason, status, created_at")
    .eq("target_type", "user")
    .or(
      `and(reporter_id.eq.${conversation.buyerId},reported_user_id.eq.${conversation.sellerId}),and(reporter_id.eq.${conversation.sellerId},reported_user_id.eq.${conversation.buyerId})`,
    )
    .order("created_at", { ascending: false })
    .limit(20);
  const linked = [...(reports.data ?? []), ...(userReports ?? [])].map((r) => ({ id: r.id, caseNumber: r.case_number, reason: r.reason, status: r.status, createdAt: r.created_at }));
  return {
    conversation,
    reports: linked,
    grant: grant.data,
    isParticipant: actor.id === conversation.buyerId || actor.id === conversation.sellerId,
  };
}

export const accessInput = z
  .object({
    conversationId: z.uuid(),
    reason: z.string().trim().min(10, "Describe why you need to read this conversation (at least 10 characters).").max(1000),
    reportId: z.uuid().optional(),
  })
  .strict();

export async function grantConversationAccess(actor: Viewer, input: z.infer<typeof accessInput>) {
  assertPermission(actor, "messages.investigate");
  const { data, error } = await createAdminClient().rpc("admin_grant_conversation_access", {
    p_actor: actor.id,
    p_conversation_id: input.conversationId,
    p_reason: input.reason,
    p_report_id: input.reportId ?? null,
  });
  if (error) throw fromDbError(error);
  return { expiresAt: data?.[0]?.expires_at ?? null };
}

/** Messages, only while the actor holds a valid grant. Each call is audited in the database. */
export async function readConversationMessages(actor: Viewer, conversationId: string) {
  assertPermission(actor, "messages.investigate");
  const { data, error } = await createAdminClient().rpc("admin_conversation_messages", { p_actor: actor.id, p_conversation_id: conversationId });
  if (error) throw fromDbError(error);
  return (data ?? []).map((m) => ({ id: m.id!, senderId: m.sender_id, kind: m.kind!, body: m.body ?? "", createdAt: m.created_at! }));
}

export const restrictConversationInput = z
  .object({
    conversationId: z.uuid(),
    restrict: z.boolean(),
    reason: z.string().trim().min(3, "Record a reason (at least 3 characters).").max(500),
    reportId: z.uuid().optional(),
  })
  .strict();

export async function restrictConversation(actor: Viewer, input: z.infer<typeof restrictConversationInput>) {
  assertPermission(actor, "messages.investigate");
  const { error } = await createAdminClient().rpc("admin_restrict_conversation", {
    p_actor: actor.id,
    p_conversation_id: input.conversationId,
    p_restrict: input.restrict,
    p_reason: input.reason,
    p_report_id: input.reportId ?? null,
  });
  if (error) throw fromDbError(error);
}
