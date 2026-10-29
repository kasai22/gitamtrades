import type { ListingStatus, ModerationStatus } from "./constants";

/**
 * Seller-initiated lifecycle transitions (PRD §8.3). The database function
 * public.listing_transition_allowed() is the authority; this mirror drives the UI and is checked
 * against the database in tests/db/status-parity.test.ts.
 */
export const SELLER_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ["removed"],
  active: ["on_hold", "sold", "removed"],
  on_hold: ["active", "sold", "removed"],
  sold: ["active", "removed"],
  expired: ["active", "removed"],
  removed: [],
};

export function canTransition(from: ListingStatus, to: ListingStatus): boolean {
  return SELLER_TRANSITIONS[from].includes(to);
}

/** Active/on-hold listings past their expiry are treated as expired everywhere. */
export function effectiveStatus(status: ListingStatus, expiresAt: string | null, now: Date = new Date()): ListingStatus {
  if ((status === "active" || status === "on_hold") && expiresAt && new Date(expiresAt) <= now) return "expired";
  return status;
}

/** Whether other students can start a new conversation about the listing (DISC-04). */
export function isContactable(
  listing: { status: ListingStatus; moderation_status: ModerationStatus; expires_at: string | null },
  now: Date = new Date(),
): boolean {
  return listing.moderation_status === "clear" && effectiveStatus(listing.status, listing.expires_at, now) === "active";
}

export type SellerAction = { to: ListingStatus; label: string; destructive?: boolean };

const ACTION_LABELS: Partial<Record<`${ListingStatus}>${ListingStatus}`, string>> = {
  "active>on_hold": "Put on hold",
  "active>sold": "Mark as sold",
  "active>removed": "Remove listing",
  "on_hold>active": "Make active again",
  "on_hold>sold": "Mark as sold",
  "on_hold>removed": "Remove listing",
  "sold>active": "Relist item",
  "sold>removed": "Remove listing",
  "expired>active": "Renew listing",
  "expired>removed": "Remove listing",
  "draft>removed": "Delete draft",
};

/** Status actions to offer the seller, respecting moderation state (restricted listings can't be reactivated). */
export function sellerActions(
  listing: { status: ListingStatus; moderation_status: ModerationStatus; expires_at: string | null },
  now: Date = new Date(),
): SellerAction[] {
  const from = effectiveStatus(listing.status, listing.expires_at, now);
  return SELLER_TRANSITIONS[from]
    .filter((to) => to !== "active" || listing.moderation_status === "clear")
    .map((to) => ({ to, label: ACTION_LABELS[`${from}>${to}`] ?? to, destructive: to === "removed" }));
}

/** Days until expiry (negative when already expired), or null when no expiry is set. */
export function daysUntilExpiry(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
}
