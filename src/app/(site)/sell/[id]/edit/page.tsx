import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormMessage } from "@/components/shared/form";
import { PageContainer, PageHeader } from "@/components/shared/states";
import { requireVerified } from "@/lib/auth/session";
import { ListingForm } from "@/features/listings/components/listing-form";
import { getCategories, getEditableListing, getMeetupAreas } from "@/features/listings/queries";
import { ModerationNotice } from "@/features/moderation/components/moderation-notice";
import { loadActivePolicy } from "@/features/moderation/server";
import { features } from "@/lib/config";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: PageProps<"/sell/[id]/edit">) {
  const { id } = await params;
  const viewer = await requireVerified(`/sell/${id}/edit`);
  // Ownership check: other users' listings 404 (and the server action/SQL re-check ownership).
  const listing = await getEditableListing(id, viewer.id);
  if (!listing) notFound();

  if (listing.status === "removed" || listing.moderationStatus === "removed") {
    return (
      <PageContainer size="md">
        <PageHeader title="Edit listing" />
        <FormMessage error="This listing has been removed and can't be edited." />
        <Link href={`/appeals/new?listing=${listing.id}`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Request a review</Link>
      </PageContainer>
    );
  }

  const [categories, meetupAreas, policy] = await Promise.all([getCategories(), features.meetupAreas ? getMeetupAreas() : Promise.resolve([]), loadActivePolicy()]);
  return (
    <PageContainer size="md">
      <PageHeader title="Edit listing" description={listing.title} />
      <div className="mb-6">
        <ModerationNotice status={listing.moderationStatus} reasons={listing.moderationReasons} listingId={listing.id} editable={false} />
      </div>
      <ListingForm
        listingId={listing.id}
        isDraft={listing.status === "draft"}
        categories={categories.filter((c) => c.id === listing.category.id || !policy.config.disabledCategorySlugs.includes(c.slug))}
        meetupAreas={meetupAreas}
        maxImages={policy.config.maxImagesPerListing}
        initial={{
          title: listing.title,
          categoryId: listing.category.id,
          priceInr: String(listing.priceInr),
          condition: listing.condition,
          description: listing.description,
          meetupAreaId: listing.meetupArea?.id ?? "",
          ticketEventName: listing.ticketEventName ?? "",
          ticketEventDate: listing.ticketEventDate ?? "",
          ticketTransferConfirmed: listing.ticketTransferConfirmed,
        }}
        initialImages={listing.images.map((i) => ({ id: i.id, thumbUrl: i.thumbUrl, qrDetected: i.qrDetected }))}
      />
    </PageContainer>
  );
}
