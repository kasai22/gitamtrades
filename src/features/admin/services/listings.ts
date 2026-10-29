import "server-only";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/admin";
import type { Viewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LISTING_BUCKET, signPaths } from "@/lib/storage";
import type { Enums, Json } from "@/types/database";
import { REASON_MESSAGES, type ReasonCode } from "@/features/moderation/policy";
import { fromDbError } from "../errors";
import type { ListParams } from "../lib/list-params";

/** Admin listing states (docs/ADMIN_DATA_BOUNDARIES.md §4); computed by admin_listing_state() in SQL. */
export const LISTING_STATES = ["all", "live", "reserved", "sold", "expired", "draft", "flagged", "quarantined", "blocked", "removed"] as const;
export type ListingStateFilter = (typeof LISTING_STATES)[number];
export type AdminListingState = Exclude<ListingStateFilter, "all" | "flagged">;
export const LISTING_SORTS = ["updated_at", "created_at", "price", "reports"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

/** Investigation signals: automated reason codes worth filtering on. */
export const LISTING_SIGNALS: { code: ReasonCode; label: string }[] = [
  { code: "external_link", label: "Suspicious link" },
  { code: "possible_scam_language", label: "Scam language" },
  { code: "duplicate_listing", label: "Duplicate listing" },
  { code: "copied_listing_text", label: "Copied text" },
  { code: "reused_image", label: "Reused image" },
  { code: "qr_code_in_image", label: "QR code in photo" },
  { code: "ticket_photo_review", label: "Ticket photo review" },
  { code: "needs_review_term", label: "Review term" },
  { code: "repeat_policy_violations", label: "Repeat violations" },
  { code: "under_review_reports", label: "Report threshold" },
];

export type AdminListingRow = {
  id: string;
  title: string;
  priceInr: number;
  condition: Enums<"item_condition">;
  status: Enums<"listing_status">;
  moderationStatus: Enums<"moderation_status">;
  moderationSource: Enums<"moderation_source"> | null;
  adminState: AdminListingState;
  categoryName: string;
  categorySlug: string;
  sellerId: string;
  sellerName: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  openReportCount: number;
  reasonCodes: string[];
  thumbUrl: string | null;
};

export async function listListings(
  actor: Viewer,
  params: ListParams<ListingSort> & { state: ListingStateFilter; category?: string; signal?: string; sellerId?: string },
): Promise<{ rows: AdminListingRow[]; total: number }> {
  assertPermission(actor, "listings.view");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_listings", {
    p_q: params.q || null,
    p_state: params.state,
    p_category: params.category ?? null,
    p_signal: params.signal ?? null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.offset,
    p_seller: params.sellerId ?? null,
  });
  if (error) throw fromDbError(error);
  // Storage RLS decides whether each thumbnail can be signed (listings.view covers hidden listings).
  const urls = await signPaths(supabase, LISTING_BUCKET, (data ?? []).map((r) => r.thumb_path));
  const rows = (data ?? []).map((r) => ({
    id: r.id!,
    title: r.title!,
    priceInr: r.price_inr ?? 0,
    condition: r.condition!,
    status: r.status!,
    moderationStatus: r.moderation_status!,
    moderationSource: r.moderation_source,
    adminState: r.admin_state as AdminListingState,
    categoryName: r.category_name ?? "",
    categorySlug: r.category_slug ?? "",
    sellerId: r.seller_id!,
    sellerName: r.seller_name ?? "",
    createdAt: r.created_at!,
    updatedAt: r.updated_at!,
    publishedAt: r.published_at,
    openReportCount: r.open_report_count ?? 0,
    reasonCodes: r.reason_codes ?? [],
    thumbUrl: r.thumb_path ? (urls.get(r.thumb_path) ?? null) : null,
  }));
  return { rows, total: data?.[0]?.total_count ?? 0 };
}

export async function getListingDetail(actor: Viewer, listingId: string) {
  assertPermission(actor, "listings.view");
  const supabase = await createClient();
  const { data: listing, error } = await supabase
    .from("listings")
    .select(
      `id, title, description, price_inr, condition, status, moderation_status, moderation_source, moderation_reasons, moderation_rule_version,
       published_at, expires_at, sold_at, created_at, updated_at, ticket_event_name, ticket_event_date, ticket_transfer_confirmed,
       seller:profiles!listings_seller_id_fkey (id, display_name, created_at, email_verified_at), categories (name, slug, is_ticket),
       listing_images (id, storage_path, thumb_path, position, qr_detected, content_hash, width, height)`,
    )
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!listing) return null;

  const images = [...(listing.listing_images ?? [])].sort((a, b) => a.position - b.position);
  const hashes = images.map((i) => i.content_hash);
  const admin = createAdminClient();
  const [urls, events, reports, declarations, duplicateImages, sameTitle, sellerListings, favourites, conversations] = await Promise.all([
    signPaths(supabase, LISTING_BUCKET, images.map((i) => i.storage_path)),
    supabase
      .from("moderation_events")
      .select("id, action, source, reason_codes, reason_text, rule_version, created_at, actor:profiles!moderation_events_actor_id_fkey (display_name)")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("reports").select("id, case_number, reason, status, severity, created_at").eq("listing_id", listingId).order("created_at", { ascending: false }).limit(50),
    supabase.from("listing_declarations").select("id, policy_version, owns_item, complies_with_policy, ticket_transferable, declared_at").eq("listing_id", listingId).order("declared_at", { ascending: false }).limit(5),
    hashes.length
      ? supabase.from("listing_images").select("listing_id, owner_id").in("content_hash", hashes).neq("listing_id", listingId).not("listing_id", "is", null).limit(20)
      : Promise.resolve({ data: [] as { listing_id: string | null; owner_id: string }[] }),
    supabase.from("listings").select("id, title, status, moderation_status, seller_id").ilike("title", listing.title.replace(/[%_\\]/g, "")).neq("id", listingId).limit(10),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", listing.seller?.id ?? ""),
    // Aggregate engagement only (no buyer identities or message content).
    admin.from("favourites").select("listing_id", { count: "exact", head: true }).eq("listing_id", listingId),
    admin.from("conversations").select("id", { count: "exact", head: true }).eq("listing_id", listingId),
  ]);
  const reasons = (Array.isArray(listing.moderation_reasons) ? listing.moderation_reasons : []) as { code?: string; message?: string; field?: string; severity?: string }[];
  const duplicateListingIds = [...new Set((duplicateImages.data ?? []).map((d) => d.listing_id).filter((id): id is string => Boolean(id)))];

  return {
    listing,
    images: images.map((i) => ({ ...i, url: urls.get(i.storage_path) ?? null })),
    reasons,
    events: events.data ?? [],
    reports: reports.data ?? [],
    declarations: declarations.data ?? [],
    duplicates: {
      imageMatches: duplicateListingIds,
      titleMatches: sameTitle.data ?? [],
    },
    stats: { sellerListingCount: sellerListings.count ?? 0, favourites: favourites.count ?? 0, conversations: conversations.count ?? 0 },
  };
}

export type ListingDetail = NonNullable<Awaited<ReturnType<typeof getListingDetail>>>;

export const moderateInput = z
  .object({
    listingIds: z.array(z.uuid()).min(1, "Select at least one listing.").max(50, "Bulk actions are limited to 50 listings at a time."),
    action: z.enum(["quarantine", "remove", "restore"]),
    reason: z.string().trim().min(3, "Record a reason (at least 3 characters).").max(1000),
    reportId: z.uuid().optional(),
    reportSummary: z.string().trim().min(3).max(1000).optional(),
  })
  .strict();

/** Seller-facing explanation stored on the listing (the seller sees it and can appeal). */
function sellerReasons(action: "quarantine" | "remove" | "restore", reason: string): Json {
  if (action === "restore") return [];
  const code: ReasonCode = action === "remove" ? "removed_by_safety_team" : "under_review_safety_team";
  const message = action === "remove" ? `${REASON_MESSAGES.removed_by_safety_team} ${reason}` : REASON_MESSAGES.under_review_safety_team;
  return [{ code, severity: action === "remove" ? "block" : "limit", field: "listing", message }];
}

export async function moderateListings(actor: Viewer, input: z.infer<typeof moderateInput>) {
  assertPermission(actor, "listings.moderate");
  const { data, error } = await createAdminClient().rpc("admin_moderate_listings", {
    p_actor: actor.id,
    p_listing_ids: [...new Set(input.listingIds)],
    p_action: input.action,
    p_reason: input.reason,
    p_reasons: sellerReasons(input.action, input.reason),
    p_report_id: input.reportId ?? null,
    p_report_summary: input.reportId && input.action === "remove" ? (input.reportSummary ?? "The listing was removed.") : null,
  });
  if (error) throw fromDbError(error);
  return { updated: data ?? 0 };
}
