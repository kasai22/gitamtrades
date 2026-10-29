import type { Enums } from "@/types/database";

export type ListingStatus = Enums<"listing_status">;
export type ModerationStatus = Enums<"moderation_status">;
export type ItemCondition = Enums<"item_condition">;

export const CONDITIONS: { value: ItemCondition; label: string; hint: string }[] = [
  { value: "new", label: "New", hint: "Unused, possibly still sealed" },
  { value: "like_new", label: "Like new", hint: "Used a few times, no visible wear" },
  { value: "good", label: "Good", hint: "Normal signs of use, works well" },
  { value: "fair", label: "Fair", hint: "Visible wear or minor issues (describe them)" },
  { value: "for_parts", label: "For parts / repair", hint: "Doesn't fully work" },
];

export const CONDITION_LABELS: Record<ItemCondition, string> = Object.fromEntries(
  CONDITIONS.map((c) => [c.value, c.label]),
) as Record<ItemCondition, string>;

export const STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  sold: "Sold",
  expired: "Expired",
  removed: "Removed",
};

export const MODERATION_LABELS: Record<ModerationStatus, string> = {
  unchecked: "Not checked",
  clear: "Live",
  limited: "Under review",
  blocked: "Needs changes",
  removed: "Removed by safety team",
};

export const MAX_TITLE = 80;
export const MAX_DESCRIPTION = 2000;
export const MAX_PRICE_INR = 1_000_000;
