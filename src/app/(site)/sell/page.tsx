import type { Metadata } from "next";
import { FormMessage } from "@/components/shared/form";
import { PageContainer, PageHeader } from "@/components/shared/states";
import { requireVerified } from "@/lib/auth/session";
import { ListingForm } from "@/features/listings/components/listing-form";
import { StartSelling } from "@/features/listings/components/start-selling";
import { getCategories, getMeetupAreas } from "@/features/listings/queries";
import { loadActivePolicy } from "@/features/moderation/server";
import { features } from "@/lib/config";

export const metadata: Metadata = { title: "Sell an item" };

export default async function SellPage() {
  const viewer = await requireVerified("/sell");
  if (!viewer.isSeller) {
    return (
      <PageContainer size="md">
        <PageHeader title="Sell an item" description="Students at your university can find it and message you directly." />
        <StartSelling />
      </PageContainer>
    );
  }
  if (!viewer.canSell) {
    return (
      <PageContainer size="md">
        <PageHeader title="Sell an item" />
        <FormMessage error="Your account can't publish listings right now. See your account page for details and how to request a review." />
      </PageContainer>
    );
  }
  const [categories, meetupAreas, policy] = await Promise.all([getCategories(), features.meetupAreas ? getMeetupAreas() : Promise.resolve([]), loadActivePolicy()]);
  const available = categories.filter((c) => !policy.config.disabledCategorySlugs.includes(c.slug));
  return (
    <PageContainer size="md">
      <PageHeader title="Sell an item" description="Most listings take under three minutes and go live straight away." />
      <ListingForm categories={available} meetupAreas={meetupAreas} maxImages={policy.config.maxImagesPerListing} />
    </PageContainer>
  );
}
