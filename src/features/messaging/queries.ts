import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET, LISTING_BUCKET, signPaths } from "@/lib/storage";
import type { Enums } from "@/types/database";
import type { ListingStatus, ModerationStatus } from "@/features/listings/constants";

export type ChatMessage = {
  id: string;
  senderId: string | null;
  kind: Enums<"message_kind">;
  body: string;
  clientId: string;
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  role: "buyer" | "seller";
  otherName: string;
  otherAvatarUrl: string | null;
  listingId: string;
  listingTitle: string;
  listingThumbUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
};

export async function listConversations(viewerId: string): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      `id, buyer_id, seller_id, created_at, last_message_at, last_message_preview, buyer_last_read_at, seller_last_read_at,
       listings (id, title, listing_images (thumb_path, position)),
       buyer:profiles!conversations_buyer_id_fkey (display_name, avatar_path),
       seller:profiles!conversations_seller_id_fkey (display_name, avatar_path)`,
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const rows = data ?? [];
  const thumbs = rows.map((c) => [...(c.listings?.listing_images ?? [])].sort((a, b) => a.position - b.position)[0]?.thumb_path ?? null);
  const avatars = rows.map((c) => (c.buyer_id === viewerId ? c.seller?.avatar_path : c.buyer?.avatar_path) ?? null);
  const [thumbUrls, avatarUrls] = await Promise.all([
    signPaths(supabase, LISTING_BUCKET, thumbs),
    signPaths(supabase, AVATAR_BUCKET, avatars),
  ]);

  return rows.map((c, i) => {
    const role = c.buyer_id === viewerId ? "buyer" : "seller";
    const other = role === "buyer" ? c.seller : c.buyer;
    const lastRead = role === "buyer" ? c.buyer_last_read_at : c.seller_last_read_at;
    return {
      id: c.id,
      role,
      otherName: other?.display_name ?? "Student",
      otherAvatarUrl: avatars[i] ? (avatarUrls.get(avatars[i]!) ?? null) : null,
      listingId: c.listings?.id ?? "",
      listingTitle: c.listings?.title ?? "Listing no longer available",
      listingThumbUrl: thumbs[i] ? (thumbUrls.get(thumbs[i]!) ?? null) : null,
      lastMessageAt: c.last_message_at,
      lastMessagePreview: c.last_message_preview,
      unread: Boolean(c.last_message_at && (!lastRead || new Date(c.last_message_at) > new Date(lastRead))),
    };
  });
}

export type ConversationDetail = {
  id: string;
  role: "buyer" | "seller";
  other: { id: string; name: string; avatarUrl: string | null; emailVerified: boolean };
  listing: {
    id: string;
    title: string;
    priceInr: number;
    status: ListingStatus;
    moderationStatus: ModerationStatus;
    expiresAt: string | null;
    thumbUrl: string | null;
    meetupAreaName: string | null;
  } | null;
  messages: ChatMessage[];
  hasMore: boolean;
  /** Viewer has blocked the other participant. */
  blockedByMe: boolean;
  /** Messaging is not possible (either side blocked, or the viewer is restricted). */
  canSend: boolean;
};

const PAGE = 100;

export async function getConversation(conversationId: string, viewerId: string): Promise<ConversationDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("conversations")
    .select(
      `id, buyer_id, seller_id, listing_id,
       listings (id, title, price_inr, status, moderation_status, expires_at, meetup_areas (name), listing_images (thumb_path, position)),
       buyer:profiles!conversations_buyer_id_fkey (id, display_name, avatar_path, email_verified_at),
       seller:profiles!conversations_seller_id_fkey (id, display_name, avatar_path, email_verified_at)`,
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!c) return null; // RLS: only participants can read (AC-06 negative case).

  const role = c.buyer_id === viewerId ? "buyer" : "seller";
  const otherProfile = role === "buyer" ? c.seller : c.buyer;
  const otherId = role === "buyer" ? c.seller_id : c.buyer_id;

  const [messagesResult, blockResult, canMessageResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, kind, body, client_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(PAGE + 1),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", viewerId).eq("blocked_id", otherId).maybeSingle(),
    supabase.rpc("can_message", { p_conversation_id: conversationId }),
  ]);

  const rows = messagesResult.data ?? [];
  const thumbPath = [...(c.listings?.listing_images ?? [])].sort((a, b) => a.position - b.position)[0]?.thumb_path ?? null;
  const [thumbUrls, avatarUrls] = await Promise.all([
    signPaths(supabase, LISTING_BUCKET, [thumbPath]),
    signPaths(supabase, AVATAR_BUCKET, [otherProfile?.avatar_path]),
  ]);

  return {
    id: c.id,
    role,
    other: {
      id: otherId,
      name: otherProfile?.display_name ?? "Student",
      avatarUrl: otherProfile?.avatar_path ? (avatarUrls.get(otherProfile.avatar_path) ?? null) : null,
      emailVerified: Boolean(otherProfile?.email_verified_at),
    },
    listing: c.listings
      ? {
          id: c.listings.id,
          title: c.listings.title,
          priceInr: c.listings.price_inr,
          status: c.listings.status,
          moderationStatus: c.listings.moderation_status,
          expiresAt: c.listings.expires_at,
          thumbUrl: thumbPath ? (thumbUrls.get(thumbPath) ?? null) : null,
          meetupAreaName: c.listings.meetup_areas?.name ?? null,
        }
      : null,
    messages: rows
      .slice(0, PAGE)
      .reverse()
      .map((m) => ({ id: m.id, senderId: m.sender_id, kind: m.kind, body: m.body, clientId: m.client_id, createdAt: m.created_at })),
    hasMore: rows.length > PAGE,
    blockedByMe: Boolean(blockResult.data),
    canSend: canMessageResult.data === true,
  };
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_conversation_count");
  return data ?? 0;
}
