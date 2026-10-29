import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET, LISTING_BUCKET, signPaths } from "@/lib/storage";
import { LISTING_PAGE_SIZE } from "@/lib/config";
import type { SearchFilters } from "@/features/search/params";
import type { ModerationReason } from "@/features/moderation/engine";
import type { ItemCondition, ListingStatus, ModerationStatus } from "./constants";

export type Category = { id: string; slug: string; name: string; description: string | null; icon: string; isTicket: boolean };
export type MeetupArea = { id: string; name: string; description: string | null };

export type ListingCard = {
  id: string;
  title: string;
  priceInr: number;
  condition: ItemCondition;
  status: ListingStatus;
  publishedAt: string | null;
  categoryName: string;
  categorySlug: string;
  sellerName: string;
  meetupAreaName: string | null;
  thumbUrl: string | null;
  imageCount: number;
};

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, description, icon, is_ticket")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, icon: c.icon, isTicket: c.is_ticket }));
});

export const getMeetupAreas = cache(async (): Promise<MeetupArea[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("meetup_areas").select("id, name, description").eq("is_active", true).order("sort_order");
  return data ?? [];
});

/** DISC-02/03: search + filters + pagination through the RLS-respecting search_listings() RPC. */
export async function searchListings(filters: SearchFilters, pageSize = LISTING_PAGE_SIZE) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_listings", {
    p_query: filters.q || null,
    p_category_slug: filters.category,
    p_min_price: filters.minPrice,
    p_max_price: filters.maxPrice,
    p_conditions: filters.conditions.length ? filters.conditions : null,
    p_include_on_hold: filters.includeOnHold,
    p_sort: filters.sort,
    p_limit: pageSize,
    p_offset: (filters.page - 1) * pageSize,
  });
  if (error) throw new Error(`search_listings failed: ${error.message}`);
  const rows = data ?? [];
  const urls = await signPaths(supabase, LISTING_BUCKET, rows.map((r) => r.cover_thumb_path));
  const items: ListingCard[] = rows.map((r) => ({
    id: r.id!,
    title: r.title!,
    priceInr: r.price_inr!,
    condition: r.condition!,
    status: r.status!,
    publishedAt: r.published_at,
    categoryName: r.category_name!,
    categorySlug: r.category_slug!,
    sellerName: r.seller_name!,
    meetupAreaName: r.meetup_area_name,
    thumbUrl: r.cover_thumb_path ? (urls.get(r.cover_thumb_path) ?? null) : null,
    imageCount: r.image_count ?? 0,
  }));
  const total = Number(rows[0]?.total_count ?? 0);
  return { items, total, page: filters.page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export type ListingDetail = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceInr: number;
  condition: ItemCondition;
  status: ListingStatus;
  moderationStatus: ModerationStatus;
  moderationReasons: ModerationReason[];
  publishedAt: string | null;
  updatedAt: string;
  expiresAt: string | null;
  soldAt: string | null;
  ticketEventName: string | null;
  ticketEventDate: string | null;
  ticketTransferConfirmed: boolean;
  category: Category;
  meetupArea: MeetupArea | null;
  seller: { id: string; displayName: string; avatarUrl: string | null; memberSince: string; emailVerified: boolean };
  images: { id: string; url: string | null; thumbUrl: string | null; width: number | null; height: number | null; qrDetected: boolean }[];
};

/** Single listing as visible to the current user (RLS decides visibility). */
export const getListing = cache(async (id: string): Promise<ListingDetail | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: l } = await supabase
    .from("listings")
    .select(
      `id, seller_id, title, description, price_inr, condition, status, moderation_status, moderation_reasons,
       published_at, updated_at, expires_at, sold_at, ticket_event_name, ticket_event_date, ticket_transfer_confirmed,
       categories (id, slug, name, description, icon, is_ticket),
       meetup_areas (id, name, description),
       profiles!listings_seller_id_fkey (id, display_name, avatar_path, created_at, email_verified_at),
       listing_images (id, storage_path, thumb_path, position, width, height, qr_detected)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!l || !l.categories || !l.profiles) return null;

  const images = [...(l.listing_images ?? [])].sort((a, b) => a.position - b.position);
  const [imageUrls, avatarUrls] = await Promise.all([
    signPaths(supabase, LISTING_BUCKET, images.flatMap((i) => [i.storage_path, i.thumb_path])),
    signPaths(supabase, AVATAR_BUCKET, [l.profiles.avatar_path]),
  ]);

  return {
    id: l.id,
    sellerId: l.seller_id,
    title: l.title,
    description: l.description,
    priceInr: l.price_inr,
    condition: l.condition,
    status: l.status,
    moderationStatus: l.moderation_status,
    moderationReasons: Array.isArray(l.moderation_reasons) ? (l.moderation_reasons as unknown as ModerationReason[]) : [],
    publishedAt: l.published_at,
    updatedAt: l.updated_at,
    expiresAt: l.expires_at,
    soldAt: l.sold_at,
    ticketEventName: l.ticket_event_name,
    ticketEventDate: l.ticket_event_date,
    ticketTransferConfirmed: l.ticket_transfer_confirmed,
    category: {
      id: l.categories.id,
      slug: l.categories.slug,
      name: l.categories.name,
      description: l.categories.description,
      icon: l.categories.icon,
      isTicket: l.categories.is_ticket,
    },
    meetupArea: l.meetup_areas,
    seller: {
      id: l.profiles.id,
      displayName: l.profiles.display_name,
      avatarUrl: l.profiles.avatar_path ? (avatarUrls.get(l.profiles.avatar_path) ?? null) : null,
      memberSince: l.profiles.created_at,
      emailVerified: Boolean(l.profiles.email_verified_at),
    },
    images: images.map((i) => ({
      id: i.id,
      url: imageUrls.get(i.storage_path) ?? null,
      thumbUrl: imageUrls.get(i.thumb_path) ?? null,
      width: i.width,
      height: i.height,
      qrDetected: i.qr_detected,
    })),
  };
});

/** Viewer-specific context for a listing page: favourite state and any existing conversation. */
export async function getListingViewerState(listingId: string, viewerId: string) {
  const supabase = await createClient();
  const [favourite, conversation] = await Promise.all([
    supabase.from("favourites").select("listing_id").eq("listing_id", listingId).eq("user_id", viewerId).maybeSingle(),
    supabase.from("conversations").select("id").eq("listing_id", listingId).eq("buyer_id", viewerId).maybeSingle(),
  ]);
  return { isFavourite: Boolean(favourite.data), conversationId: conversation.data?.id ?? null };
}

export type SellerListing = {
  id: string;
  title: string;
  priceInr: number;
  status: ListingStatus;
  moderationStatus: ModerationStatus;
  moderationReasons: ModerationReason[];
  expiresAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  categoryName: string;
  thumbUrl: string | null;
  conversationCount: number;
};

/** The seller's own listings in every state (My Listings). */
export async function getMyListings(sellerId: string): Promise<SellerListing[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(
      `id, title, price_inr, status, moderation_status, moderation_reasons, expires_at, published_at, updated_at,
       categories (name), listing_images (thumb_path, position), conversations (count)`,
    )
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const covers = rows.map((r) => [...(r.listing_images ?? [])].sort((a, b) => a.position - b.position)[0]?.thumb_path ?? null);
  const urls = await signPaths(supabase, LISTING_BUCKET, covers);
  return rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    priceInr: r.price_inr,
    status: r.status,
    moderationStatus: r.moderation_status,
    moderationReasons: Array.isArray(r.moderation_reasons) ? (r.moderation_reasons as unknown as ModerationReason[]) : [],
    expiresAt: r.expires_at,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
    categoryName: r.categories?.name ?? "",
    thumbUrl: covers[i] ? (urls.get(covers[i]!) ?? null) : null,
    conversationCount: (r.conversations as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

/** Listing + images in the shape the edit form needs. Only the owner can load it. */
export async function getEditableListing(id: string, sellerId: string) {
  const listing = await getListing(id);
  if (!listing || listing.sellerId !== sellerId) return null;
  return listing;
}

export async function getFavouriteListings(userId: string): Promise<ListingCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favourites")
    .select(
      `created_at, listings (id, title, price_inr, condition, status, published_at, expires_at, moderation_status,
        categories (name, slug), profiles!listings_seller_id_fkey (display_name), meetup_areas (name),
        listing_images (thumb_path, position))`,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []).flatMap((f) => (f.listings ? [f.listings] : []));
  const covers = rows.map((l) => [...(l.listing_images ?? [])].sort((a, b) => a.position - b.position)[0]?.thumb_path ?? null);
  const urls = await signPaths(supabase, LISTING_BUCKET, covers);
  return rows.map((l, i) => ({
    id: l.id,
    title: l.title,
    priceInr: l.price_inr,
    condition: l.condition,
    // Saved views reflect the live status (LIST-05 "propagate to saved references").
    status: l.expires_at && new Date(l.expires_at) <= new Date() && (l.status === "active" || l.status === "on_hold") ? "expired" : l.status,
    publishedAt: l.published_at,
    categoryName: l.categories?.name ?? "",
    categorySlug: l.categories?.slug ?? "",
    sellerName: l.profiles?.display_name ?? "",
    meetupAreaName: l.meetup_areas?.name ?? null,
    thumbUrl: covers[i] ? (urls.get(covers[i]!) ?? null) : null,
    imageCount: l.listing_images?.length ?? 0,
  }));
}
