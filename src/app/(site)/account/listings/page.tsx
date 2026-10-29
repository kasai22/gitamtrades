import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, ImageOff, MessageCircle, Package, Plus } from "lucide-react";
import { ListingStatusBadge, ModerationBadge, PriceDisplay } from "@/components/marketplace/badges";
import { EmptyState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { requireVerified } from "@/lib/auth/session";
import { formatDate, formatRelative } from "@/lib/format";
import { SellerControls } from "@/features/listings/components/seller-controls";
import { getMyListings } from "@/features/listings/queries";
import { daysUntilExpiry, effectiveStatus } from "@/features/listings/status";
import { loadActivePolicy } from "@/features/moderation/server";

export const metadata: Metadata = { title: "My listings" };

export default async function MyListingsPage() {
  const viewer = await requireVerified("/account/listings");
  const [listings, policy] = await Promise.all([getMyListings(viewer.id), loadActivePolicy()]);
  const reminderDays = policy.config.expiryReminderDays;
  const visible = listings.filter((l) => l.status !== "removed");
  const expiringSoon = visible.filter((l) => {
    const days = daysUntilExpiry(l.expiresAt);
    return effectiveStatus(l.status, l.expiresAt) === "active" && days !== null && days <= reminderDays;
  });

  return (
    <>
      <PageHeader
        title="My listings"
        description="Mark items sold as soon as you've handed them over, so nobody wastes a trip."
        actions={<Button asChild><Link href="/sell"><Plus aria-hidden /> Sell an item</Link></Button>}
      />

      {expiringSoon.length > 0 && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-warning-foreground/20 bg-warning p-4 text-sm text-warning-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          {expiringSoon.length === 1 ? "1 listing expires" : `${expiringSoon.length} listings expire`} within {reminderDays} days. Renew them to keep them visible.
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={Package} title="You haven't listed anything yet" description="Clearing your room? It takes under three minutes." action={{ href: "/sell", label: "Sell an item" }} />
      ) : (
        <ul className="grid gap-3" role="list">
          {visible.map((listing) => {
            const status = effectiveStatus(listing.status, listing.expiresAt);
            const days = daysUntilExpiry(listing.expiresAt);
            return (
              <li key={listing.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:p-4">
                <Link href={`/listings/${listing.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {listing.thumbUrl ? (
                      <Image src={listing.thumbUrl} alt="" fill unoptimized sizes="64px" className="object-cover" />
                    ) : (
                      <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <ListingStatusBadge status={status} />
                      <ModerationBadge status={listing.moderationStatus} />
                    </div>
                    <p className="truncate font-medium">{listing.title}</p>
                    <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <PriceDisplay priceInr={listing.priceInr} size="sm" className="text-foreground" />
                      <span>{listing.categoryName}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="size-3" aria-hidden />{listing.conversationCount}</span>
                      {status === "active" && days !== null && <span>{days <= reminderDays ? `Expires in ${Math.max(days, 0)} days` : `Visible until ${formatDate(listing.expiresAt!)}`}</span>}
                      {status === "draft" && <span>Edited {formatRelative(listing.updatedAt)}</span>}
                    </p>
                  </div>
                </Link>
                <SellerControls compact reminderDays={reminderDays} listing={{ id: listing.id, status: listing.status, moderationStatus: listing.moderationStatus, expiresAt: listing.expiresAt }} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
