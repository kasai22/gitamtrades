"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getViewer } from "@/lib/auth/session";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "./queries";

const uuid = z.uuid();
const messageSchema = z.object({
  conversationId: uuid,
  clientId: uuid,
  body: z.string().trim().min(1, "Write a message first.").max(2000, "Messages can be up to 2,000 characters."),
});

/** CHAT-01: start (or reopen) the conversation for a listing, then go to it. */
export async function startConversation(listingId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  if (!uuid.safeParse(listingId).success) return fail("We couldn't find that listing.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { p_listing_id: listingId });
  if (error || !data) return fail(friendlyError(error));
  track("chat_started", viewer.id, { conversation_id: data, listing_id: listingId });
  redirect(`/messages/${data}`);
}

/**
 * Idempotent send: the client generates `clientId` once per message, so retries after a network
 * failure never create duplicates (NFR reliability). RLS + triggers enforce participation, blocks,
 * restrictions and rate limits.
 */
export async function sendMessage(input: z.input<typeof messageSchema>): Promise<ActionResult<ChatMessage>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid message.");
  return insertMessage(viewer.id, { ...parsed.data, kind: "text" });
}

const contactSchema = z.object({
  conversationId: uuid,
  clientId: uuid,
  method: z.enum(["phone", "other"]),
  value: z.string().trim().min(3, "Enter the contact detail to share.").max(120),
  saveAsDefault: z.boolean().default(false),
});

/** CHAT-02 / AC-07: contact details are revealed only through this explicit action, to one person. */
export async function shareContact(input: z.input<typeof contactSchema>): Promise<ActionResult<ChatMessage>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid contact detail.");
  const { method, value, saveAsDefault } = parsed.data;
  if (method === "phone" && !/^\+?[0-9][0-9 -]{7,17}$/.test(value)) {
    return fail("Enter a valid phone number, for example +91 98765 43210.");
  }
  const body = method === "phone" ? `Phone: ${value}` : value;
  const result = await insertMessage(viewer.id, { conversationId: parsed.data.conversationId, clientId: parsed.data.clientId, body, kind: "contact_share" });
  if (result.ok) {
    track("contact_shared", viewer.id, { conversation_id: parsed.data.conversationId });
    if (method === "phone" && saveAsDefault) {
      const supabase = await createClient();
      await supabase.from("profile_private").update({ contact_phone: value }).eq("id", viewer.id);
    }
  }
  return result;
}

async function insertMessage(
  viewerId: string,
  message: { conversationId: string; clientId: string; body: string; kind: "text" | "contact_share" },
): Promise<ActionResult<ChatMessage>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: message.conversationId,
      sender_id: viewerId,
      kind: message.kind,
      body: message.body,
      client_id: message.clientId,
    })
    .select("id, sender_id, kind, body, client_id, created_at")
    .single();

  let row = data;
  if (error?.code === "23505") {
    // Duplicate client id: the earlier attempt succeeded; return the stored message.
    const existing = await supabase
      .from("messages")
      .select("id, sender_id, kind, body, client_id, created_at")
      .eq("conversation_id", message.conversationId)
      .eq("client_id", message.clientId)
      .maybeSingle();
    row = existing.data;
  } else if (error) {
    track("message_sent", viewerId, { conversation_id: message.conversationId, kind: message.kind, delivered: false });
    const blocked = error.code === "42501" || error.message.includes("row-level security");
    return fail(blocked ? "You can't send messages in this conversation." : friendlyError(error));
  }
  if (!row) return fail("Message not sent. Try again.");

  track("message_sent", viewerId, { conversation_id: message.conversationId, kind: message.kind, delivered: true });
  return ok({ id: row.id, senderId: row.sender_id, kind: row.kind, body: row.body, clientId: row.client_id, createdAt: row.created_at });
}

/** Polling fallback for when Supabase Realtime isn't available. */
export async function fetchMessagesSince(conversationId: string, since: string): Promise<ActionResult<ChatMessage[]>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  if (!uuid.safeParse(conversationId).success || Number.isNaN(Date.parse(since))) return fail("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, kind, body, client_id, created_at")
    .eq("conversation_id", conversationId)
    .gt("created_at", since)
    .order("created_at")
    .limit(200);
  if (error) return fail(friendlyError(error));
  return ok((data ?? []).map((m) => ({ id: m.id, senderId: m.sender_id, kind: m.kind, body: m.body, clientId: m.client_id, createdAt: m.created_at })));
}

export async function markConversationRead(conversationId: string): Promise<void> {
  if (!uuid.safeParse(conversationId).success) return;
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
}

/** CHAT-03: block a user. History is kept; new messages are refused in both directions. */
export async function blockUser(userId: string, conversationId?: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  if (!uuid.safeParse(userId).success || userId === viewer.id) return fail("You can't block this account.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("blocks")
    .upsert({ blocker_id: viewer.id, blocked_id: userId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
  if (error) return fail(friendlyError(error));
  track("user_blocked", viewer.id, {});
  if (conversationId) revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/account/settings");
  return ok(undefined, "User blocked.");
}

export async function unblockUser(userId: string, conversationId?: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  if (!uuid.safeParse(userId).success) return fail("Invalid user.");
  const supabase = await createClient();
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", viewer.id).eq("blocked_id", userId);
  if (error) return fail(friendlyError(error));
  if (conversationId) revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/account/settings");
  return ok(undefined, "User unblocked.");
}
