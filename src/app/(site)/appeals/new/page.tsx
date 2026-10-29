import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, PageContainer, PageHeader } from "@/components/shared/states";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AppealForm } from "@/features/moderation/components/appeal-form";

export const metadata: Metadata = { title: "Request a review" };

/** SAFE-04 / AC-12: reached from the explanation on a restricted listing or the account restriction banner. */
export default async function NewAppealPage({ searchParams }: PageProps<"/appeals/new">) {
  const viewer = await requireUser("/appeals/new");
  const params = await searchParams;
  const listingId = typeof params.listing === "string" ? params.listing : undefined;
  const restrictionId = typeof params.restriction === "string" ? params.restriction : undefined;
  if (!listingId === !restrictionId) notFound();

  const supabase = await createClient();
  let subject: string | null = null;
  if (listingId) {
    const { data } = await supabase
      .from("listings")
      .select("title, moderation_status")
      .eq("id", listingId)
      .eq("seller_id", viewer.id)
      .maybeSingle();
    if (data && ["limited", "blocked", "removed"].includes(data.moderation_status)) subject = `Listing: ${data.title}`;
  } else if (restrictionId) {
    const restriction = viewer.restrictions.find((r) => r.id === restrictionId);
    if (restriction) subject = `Account restriction: ${restriction.reason}`;
  }

  return (
    <PageContainer size="sm">
      <PageHeader title="Request a review" description={subject ?? undefined} />
      {subject ? (
        <AppealForm listingId={listingId} restrictionId={restrictionId} />
      ) : (
        <EmptyState title="Nothing to review" description="This listing or restriction isn't active, or it doesn't belong to your account." action={{ href: "/account", label: "Go to account" }} />
      )}
    </PageContainer>
  );
}
