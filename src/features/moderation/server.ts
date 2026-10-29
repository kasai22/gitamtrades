import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { textFingerprint, type ModerationContext } from "./engine";
import { DEFAULT_POLICY, parsePolicy, type PolicyConfig } from "./policy";

export type ActivePolicy = { config: PolicyConfig; version: number };

/** The active, versioned policy (ADMIN-03). Deduplicated per request. */
export const loadActivePolicy = cache(async (): Promise<ActivePolicy> => {
  const { data } = await createAdminClient()
    .from("policy_versions")
    .select("version, config")
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return { config: DEFAULT_POLICY, version: 0 };
  return { config: parsePolicy(data.config), version: data.version };
});

/** Hashes of blank/uniform images carry no identity signal and would cause false matches. */
function isInformativeHash(hash: string) {
  return !/^(.)\1*$/.test(hash);
}

/**
 * Gathers the behavioural signals the engine needs (SAFE-01: duplicates, copied text, reused
 * images, repeat offenders). Uses the service client because it compares against other sellers'
 * listings that the seller cannot read themselves; nothing here is returned to the client.
 */
export async function buildModerationContext(input: {
  sellerId: string;
  listingId: string | null;
  title: string;
  description: string;
  imageHashes: string[];
}): Promise<ModerationContext> {
  const admin = createAdminClient();
  const policy = await loadActivePolicy();
  const windowStart = new Date(Date.now() - policy.config.repeatOffender.windowDays * 86_400_000).toISOString();
  const hashes = input.imageHashes.filter(isInformativeHash);
  const description = input.description.trim();

  const [own, copied, reused, blocked] = await Promise.all([
    admin
      .from("listings")
      .select("id, title, description")
      .eq("seller_id", input.sellerId)
      .in("status", ["active", "on_hold"])
      .neq("moderation_status", "removed")
      .limit(200),
    description.length >= 60
      ? admin
          .from("listings")
          .select("id")
          .eq("description", description)
          .neq("seller_id", input.sellerId)
          .in("status", ["active", "on_hold", "sold"])
          .limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
    hashes.length
      ? admin
          .from("listing_images")
          .select("id")
          .in("content_hash", hashes)
          .neq("owner_id", input.sellerId)
          .not("listing_id", "is", null)
          .limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
    admin
      .from("moderation_events")
      .select("id", { count: "exact", head: true })
      .eq("subject_user_id", input.sellerId)
      .eq("action", "auto_blocked")
      .gte("created_at", windowStart),
  ]);

  const fingerprint = textFingerprint(input.title, input.description);
  const duplicateOfOwnListing = (own.data ?? []).some(
    (listing) => listing.id !== input.listingId && textFingerprint(listing.title, listing.description) === fingerprint,
  );

  return {
    policy: policy.config,
    policyVersion: policy.version,
    duplicateOfOwnListing,
    copiedTextFromOtherSeller: (copied.data ?? []).length > 0,
    reusedImageFromOtherSeller: (reused.data ?? []).length > 0,
    recentBlockedListings: blocked.count ?? 0,
  };
}
