"use server";

import { revalidatePath } from "next/cache";
import { track } from "@/lib/analytics";
import { getViewer } from "@/lib/auth/session";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformSettings } from "@/features/admin/settings";
import { createClient } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { LISTING_BUCKET } from "@/lib/storage";
import { evaluateListing, type ModerationReason } from "@/features/moderation/engine";
import { buildModerationContext, loadActivePolicy } from "@/features/moderation/server";
import { listingFormSchema, statusChangeSchema, type ListingFormInput } from "./schemas";

export type SaveListingResult = {
  listingId: string;
  outcome: "allow" | "limit" | "block" | "draft";
  reasons: ModerationReason[];
};

function revalidateListing(listingId: string) {
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/account/listings");
  revalidatePath("/marketplace");
}

/**
 * Create or update a listing (LIST-01, LIST-04, LIST-06, SAFE-01).
 * 1. Authorize (verified + seller-enabled + not restricted).
 * 2. Validate with the same schema the form uses.
 * 3. Run automated checks — no human approval step.
 * 4. Persist atomically via persist_listing() (service role, ownership re-checked in SQL).
 */
export async function saveListing(listingId: string | null, input: ListingFormInput): Promise<ActionResult<SaveListingResult>> {
  const startedAt = Date.now();
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  if (!viewer.emailVerified) return fail(friendlyError({ message: "NOT_VERIFIED" }));
  if (!viewer.canSell) {
    return fail(viewer.isSeller ? friendlyError({ message: "SELLING_RESTRICTED" }) : friendlyError({ message: "SELLING_NOT_ENABLED" }));
  }
  if (listingId !== null && !/^[0-9a-f-]{36}$/i.test(listingId)) return fail("We couldn't find that listing.");

  const parsed = listingFormSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const values = parsed.data;
  if (values.intent === "publish" && (await getPlatformSettings()).listingPublishingPaused) {
    return fail(friendlyError({ message: "PUBLISHING_PAUSED" }));
  }
  const admin = createAdminClient();

  const [{ data: category }, { data: images }, policy] = await Promise.all([
    admin.from("categories").select("id, slug, is_ticket").eq("id", values.categoryId).eq("is_active", true).maybeSingle(),
    values.imageIds.length
      ? admin.from("listing_images").select("id, content_hash, qr_detected, owner_id").in("id", values.imageIds)
      : Promise.resolve({ data: [] as { id: string; content_hash: string; qr_detected: boolean; owner_id: string }[] }),
    loadActivePolicy(),
  ]);
  if (!category) return fail("Choose a category.", { categoryId: ["Choose a category."] });
  if ((images ?? []).some((img) => img.owner_id !== viewer.id) || (images ?? []).length !== values.imageIds.length) {
    return fail(friendlyError({ message: "IMAGE_NOT_OWNED" }));
  }
  if (values.imageIds.length > policy.config.maxImagesPerListing) {
    return fail(`Add up to ${policy.config.maxImagesPerListing} photos.`);
  }

  const isTicket = category.is_ticket;
  let decision: ReturnType<typeof evaluateListing> | null = null;
  if (values.intent === "publish") {
    const context = await buildModerationContext({
      sellerId: viewer.id,
      listingId,
      title: values.title,
      description: values.description,
      imageHashes: (images ?? []).map((img) => img.content_hash),
    });
    decision = evaluateListing(
      {
        title: values.title,
        description: values.description,
        categorySlug: category.slug,
        categoryIsTicket: isTicket,
        ticketTransferConfirmed: values.ticketTransferConfirmed,
        ticketEventName: values.ticketEventName,
        images: values.imageIds.map((id) => ({ qrDetected: images?.find((img) => img.id === id)?.qr_detected ?? false })),
      },
      context,
    );
  }

  const { data, error } = await admin.rpc("persist_listing", {
    p_seller_id: viewer.id,
    p_listing_id: listingId,
    p_listing: {
      category_id: values.categoryId,
      title: values.title,
      description: values.description,
      price_inr: values.priceInr,
      condition: values.condition,
      meetup_area_id: features.meetupAreas ? values.meetupAreaId || null : null,
      ticket_event_name: isTicket ? values.ticketEventName : null,
      ticket_event_date: isTicket ? values.ticketEventDate || null : null,
      // A ticket that fails the transfer check is blocked by the engine; record what the seller confirmed.
      ticket_transfer_confirmed: isTicket && values.ticketTransferConfirmed,
      client_request_id: values.clientRequestId,
    },
    p_decision: {
      intent: values.intent,
      outcome: decision?.outcome ?? null,
      reasons: decision?.reasons ?? [],
      signals: decision?.signals ?? [],
      rule_version: decision?.ruleVersion ?? null,
      policy_version: String(policy.version),
    },
    p_image_ids: values.imageIds,
    p_declaration: {
      owns_item: values.declarationOwnsItem,
      complies_with_policy: values.declarationCompliesWithPolicy,
      // The declaration for tickets is the same explicit checkbox as the transfer confirmation.
      ticket_transferable: isTicket ? values.ticketTransferConfirmed : null,
    },
  });

  if (error || !data) {
    // A ticket without transfer confirmation is a "block" from the engine, but SQL rejects publishing it
    // outright; surface the engine's explanation in that case so the seller sees the same message.
    if (error?.message.includes("TICKET_TRANSFER_CONFIRMATION_REQUIRED")) {
      return fail(friendlyError(error), { ticketTransferConfirmed: [friendlyError(error)] });
    }
    return fail(friendlyError(error));
  }

  const result = data as { listing_id: string; status: string; moderation_status: string; removed_image_paths: string[] };
  if (result.removed_image_paths?.length) {
    await admin.storage.from(LISTING_BUCKET).remove(result.removed_image_paths);
  }

  if (decision) {
    track("listing_published", viewer.id, {
      listing_id: result.listing_id,
      category: category.slug,
      outcome: decision.outcome,
      rule_version: decision.ruleVersion,
      time_to_publish_ms: Math.max(0, Date.now() - startedAt),
      is_edit: listingId !== null,
      image_count: values.imageIds.length,
    });
    if (decision.outcome === "block") {
      track("listing_blocked", viewer.id, {
        listing_id: result.listing_id,
        category: category.slug,
        reason_codes: decision.reasons.map((r) => r.code),
        rule_version: decision.ruleVersion,
      });
    }
  }

  revalidateListing(result.listing_id);
  return ok({
    listingId: result.listing_id,
    outcome: decision ? (result.moderation_status === "limited" ? "limit" : decision.outcome) : "draft",
    reasons: decision?.reasons ?? [],
  });
}

/** Seller status changes go through change_listing_status(), which validates ownership and transitions. */
export async function changeListingStatus(listingId: string, status: "active" | "on_hold" | "sold" | "removed"): Promise<ActionResult<{ status: string }>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  const parsed = statusChangeSchema.safeParse({ listingId, status });
  if (!parsed.success) return fail("That status change isn't possible.");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("listings")
    .select("status, published_at, categories (slug)")
    .eq("id", listingId)
    .eq("seller_id", viewer.id)
    .maybeSingle();
  const { data, error } = await supabase.rpc("change_listing_status", { p_listing_id: listingId, p_status: status });
  if (error) return fail(friendlyError(error));

  if (status === "sold" && before) {
    const daysActive = before.published_at ? Math.floor((Date.now() - new Date(before.published_at).getTime()) / 86_400_000) : 0;
    track("listing_marked_sold", viewer.id, { listing_id: listingId, category: before.categories?.slug ?? "", days_active: daysActive });
  } else if (status === "active" && before) {
    track("listing_reactivated", viewer.id, { listing_id: listingId, from: before.status });
  }
  revalidateListing(listingId);
  return ok({ status: data ?? status });
}

export async function renewListing(listingId: string): Promise<ActionResult<{ expiresAt: string }>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("renew_listing", { p_listing_id: listingId });
  if (error || !data) return fail(friendlyError(error));
  revalidateListing(listingId);
  return ok({ expiresAt: data }, "Listing renewed.");
}

/** DISC-05 saved listings. RLS ensures you can only save listings you can see. */
export async function toggleFavourite(listingId: string, save: boolean): Promise<ActionResult<{ saved: boolean }>> {
  const viewer = await getViewer();
  if (!viewer?.isVerified) return fail(friendlyError({ message: "NOT_VERIFIED" }));
  const supabase = await createClient();
  const { error } = save
    ? await supabase.from("favourites").upsert({ user_id: viewer.id, listing_id: listingId }, { onConflict: "user_id,listing_id", ignoreDuplicates: true })
    : await supabase.from("favourites").delete().eq("user_id", viewer.id).eq("listing_id", listingId);
  if (error) return fail(friendlyError(error));
  revalidatePath("/account/favourites");
  return ok({ saved: save });
}

/** AUTH-03 / AC-02: self-service seller permission, no admin approval. */
export async function enableSelling(): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("enable_selling");
  if (error) return fail(friendlyError(error));
  track("seller_enabled", viewer.id, {});
  revalidatePath("/sell");
  revalidatePath("/account");
  return ok(undefined);
}

/** Analytics only: marks the start of the sell flow for the listing-completion metric. */
export async function recordListingStarted(): Promise<void> {
  const viewer = await getViewer();
  if (viewer?.canSell) track("listing_started", viewer.id, {});
}
