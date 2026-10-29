import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronRight, Info, MapPin, MessageCircle, Ticket } from "lucide-react";
import { ListingStatusBadge, PriceDisplay, VerificationIndicator } from "@/components/marketplace/badges";
import { ProductGrid } from "@/components/marketplace/product-card";
import { OfflineTransactionNote, SafetyTips } from "@/components/shared/safety";
import { PageContainer } from "@/components/shared/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { track } from "@/lib/analytics";
import { features } from "@/lib/config";
import { requireVerified } from "@/lib/auth/session";
import { formatDate, formatRelative, initials } from "@/lib/format";
import { CONDITION_LABELS } from "@/features/listings/constants";
import { ProductImageGallery } from "@/features/listings/components/image-gallery";
import { ContactSellerButton, FavouriteButton, ShareButton } from "@/features/listings/components/listing-buttons";
import { SellerControls } from "@/features/listings/components/seller-controls";
import { getListing, getListingViewerState, searchListings } from "@/features/listings/queries";
import { effectiveStatus, isContactable } from "@/features/listings/status";
import { ModerationNotice } from "@/features/moderation/components/moderation-notice";
import { ReportDialog } from "@/features/moderation/components/report-dialog";
import { loadActivePolicy } from "@/features/moderation/server";
import { parseSearchParams } from "@/features/search/params";

export async function generateMetadata({ params }: PageProps<"/listings/[id]">): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  return { title: listing?.title ?? "Listing" };
}

export default async function ListingPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const viewer = await requireVerified(`/listings/${id}`);
  const listing = await getListing(id);
  if (!listing) notFound();

  const isOwner = listing.sellerId === viewer.id;
  const status = effectiveStatus(listing.status, listing.expiresAt);
  const contactable = isContactable({ status: listing.status, moderation_status: listing.moderationStatus, expires_at: listing.expiresAt });
  const [viewerState, related, policy] = await Promise.all([
    isOwner ? Promise.resolve({ isFavourite: false, conversationId: null }) : getListingViewerState(listing.id, viewer.id),
    searchListings(parseSearchParams({}, listing.category.slug), 5),
    loadActivePolicy(),
  ]);
  const relatedItems = related.items.filter((item) => item.id !== listing.id).slice(0, 4);
  if (!isOwner) track("listing_viewed", viewer.id, { listing_id: listing.id, category: listing.category.slug });

  return (
    <PageContainer>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/marketplace" className="hover:text-foreground">Marketplace</Link></li>
          <li aria-hidden><ChevronRight className="size-3.5" /></li>
          <li><Link href={`/categories/${listing.category.slug}`} className="hover:text-foreground">{listing.category.name}</Link></li>
        </ol>
      </nav>

      {query.published === "1" && isOwner && listing.moderationStatus === "clear" && (
        <FormMessage className="mb-4" message="Your listing is live. Students at your university can now find it and message you." />
      )}

      {isOwner && (
        <div className="mb-6 grid gap-3">
          <ModerationNotice status={listing.moderationStatus} reasons={listing.moderationReasons} listingId={listing.id} editable />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div className="text-sm">
              <p className="font-medium">This is your listing</p>
              <p className="text-muted-foreground">
                {listing.expiresAt && status !== "expired" && status !== "sold" ? `Visible until ${formatDate(listing.expiresAt)}.` : null}
                {status === "expired" ? "It has expired and is hidden from discovery. Renew it to show it again." : null}
              </p>
            </div>
            <SellerControls listing={listing} reminderDays={policy.config.expiryReminderDays} />
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <ProductImageGallery images={listing.images} title={listing.title} />

        <div className="grid content-start gap-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <ListingStatusBadge status={status} />
              <span className="text-sm text-muted-foreground">{CONDITION_LABELS[listing.condition]}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{listing.title}</h1>
            <div className="mt-3">
              <PriceDisplay priceInr={listing.priceInr} size="lg" />
              {listing.priceInr > 0 && <span className="ml-2 text-sm text-muted-foreground">asking price</span>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {listing.publishedAt ? <>Listed <time dateTime={listing.publishedAt}>{formatRelative(listing.publishedAt)}</time></> : "Not published"}
              {listing.updatedAt !== listing.publishedAt && <> · Updated <time dateTime={listing.updatedAt}>{formatRelative(listing.updatedAt)}</time></>}
            </p>
          </div>

          {!isOwner && (
            <div className="grid gap-3 rounded-xl border bg-card p-4">
              {viewerState.conversationId ? (
                <Button asChild size="lg" className="w-full">
                  <Link href={`/messages/${viewerState.conversationId}`}><MessageCircle aria-hidden /> Continue chat</Link>
                </Button>
              ) : contactable ? (
                viewer.canMessage ? (
                  <ContactSellerButton listingId={listing.id} />
                ) : (
                  <FormMessage error="Your account can't start new chats right now. See your account page for details." />
                )
              ) : (
                <div role="status" className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {status === "sold"
                    ? "This item has been sold, so the seller isn't taking new messages."
                    : status === "on_hold"
                      ? "The seller has put this item on hold while they talk to a buyer. Save it and check back later."
                      : "This listing is no longer available."}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <FavouriteButton listingId={listing.id} initialSaved={viewerState.isFavourite} />
                <ShareButton title={listing.title} />
                <div className="ml-auto">
                  <ReportDialog targetType="listing" targetId={listing.id} />
                </div>
              </div>
              <OfflineTransactionNote />
            </div>
          )}

          <section aria-labelledby="seller-heading" className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <Avatar className="size-11">
              {listing.seller.avatarUrl && <AvatarImage src={listing.seller.avatarUrl} alt="" />}
              <AvatarFallback>{initials(listing.seller.displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 id="seller-heading" className="truncate font-medium">{listing.seller.displayName}</h2>
              <VerificationIndicator verified={listing.seller.emailVerified} />
              <p className="text-xs text-muted-foreground">Member since {formatDate(listing.seller.memberSince)}</p>
            </div>
            {!isOwner && <ReportDialog targetType="user" targetId={listing.seller.id} trigger={<Button variant="ghost" size="sm" className="text-muted-foreground">Report user</Button>} />}
          </section>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-muted-foreground">Category</dt>
              <dd className="font-medium">{listing.category.name}</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-muted-foreground">Condition</dt>
              <dd className="font-medium">{CONDITION_LABELS[listing.condition]}</dd>
            </div>
            {features.meetupAreas && (
            <div className="col-span-2 rounded-lg bg-muted/60 p-3">
              <dt className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-3.5" aria-hidden /> Meetup</dt>
              <dd className="font-medium">{listing.meetupArea?.name ?? "Arrange in chat"}</dd>
            </div>
            )}
            {listing.category.isTicket && (
              <div className="col-span-2 rounded-lg bg-muted/60 p-3">
                <dt className="flex items-center gap-1 text-muted-foreground"><Ticket className="size-3.5" aria-hidden /> Event</dt>
                <dd className="font-medium">
                  {listing.ticketEventName ?? "Not specified"}
                  {listing.ticketEventDate && (
                    <span className="ml-2 inline-flex items-center gap-1 font-normal text-muted-foreground">
                      <CalendarDays className="size-3.5" aria-hidden /> {formatDate(listing.ticketEventDate)}
                    </span>
                  )}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">Seller confirmed the ticket is transferable. Ticket codes are shared only at the exchange.</dd>
              </div>
            )}
          </dl>

          <section aria-labelledby="description-heading">
            <h2 id="description-heading" className="mb-2 font-semibold">Description</h2>
            {listing.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-line">{listing.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">The seller didn&apos;t add a description. Ask them about it in chat.</p>
            )}
          </section>

          {!isOwner && <SafetyTips context="contact" />}
        </div>
      </div>

      {relatedItems.length > 0 && (
        <section className="mt-12" aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-4 text-xl font-semibold">More in {listing.category.name}</h2>
          <ProductGrid listings={relatedItems} />
        </section>
      )}
    </PageContainer>
  );
}
