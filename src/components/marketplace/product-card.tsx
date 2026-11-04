import Image from "next/image";
import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";
import { CONDITION_LABELS } from "@/features/listings/constants";
import { CardFavouriteButton } from "@/features/listings/components/listing-buttons";
import type { ListingCard } from "@/features/listings/queries";
import { features } from "@/lib/config";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ListingStatusBadge, PriceDisplay } from "./badges";

type GridLayout = "full" | "sidebar";

const GRID_COLUMNS: Record<GridLayout, string> = {
  full: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  sidebar: "grid-cols-2 md:grid-cols-3",
};

/**
 * Listing card. `saved` is undefined when the viewer can't save listings (the heart is hidden);
 * otherwise it's the viewer's current favourite state.
 */
export function ProductCard({ listing, priority = false, saved }: { listing: ListingCard; priority?: boolean; saved?: boolean }) {
  const unavailable = listing.status !== "active";
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 focus-within:ring-3 focus-within:ring-ring/50 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {listing.thumbUrl ? (
          <Image
            src={listing.thumbUrl}
            alt=""
            fill
            unoptimized
            loading={priority ? "eager" : undefined}
            fetchPriority={priority ? "high" : undefined}
            sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 50vw"
            className={cn("object-cover transition-transform duration-500 group-hover:scale-[1.04]", unavailable && "opacity-75 grayscale-[35%]")}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-secondary/60 text-secondary-foreground/50">
            <ImageOff className="size-8" aria-hidden />
            <span className="sr-only">No photo</span>
          </div>
        )}
        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          {unavailable ? (
            <ListingStatusBadge status={listing.status} className="pointer-events-none bg-card shadow-sm" />
          ) : (
            <span className="pointer-events-none inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full bg-card/95 px-2.5 text-xs font-medium shadow-sm ring-1 ring-border/60 backdrop-blur">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="truncate">{CONDITION_LABELS[listing.condition]}</span>
            </span>
          )}
          {saved !== undefined && <CardFavouriteButton listingId={listing.id} title={listing.title} initialSaved={saved} />}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="truncate text-[11px] font-semibold tracking-wide text-primary uppercase">{listing.categoryName}</p>
        <h3 className="mt-1 line-clamp-2 text-sm leading-snug font-semibold sm:text-[15px]">
          <Link href={`/listings/${listing.id}`} className="outline-none after:absolute after:inset-0">
            {listing.title}
          </Link>
        </h3>
        {features.meetupAreas && listing.meetupAreaName && (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{listing.meetupAreaName}</span>
          </p>
        )}
        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-t border-dashed pt-3">
            <PriceDisplay priceInr={listing.priceInr} className="text-base sm:text-lg" />
            {listing.publishedAt && (
              <time dateTime={listing.publishedAt} className="text-xs text-muted-foreground">
                {formatRelative(listing.publishedAt)}
              </time>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({
  listings,
  priorityCount = 0,
  savedIds,
  layout = "full",
}: {
  listings: ListingCard[];
  priorityCount?: number;
  /** The viewer's saved listings. Omit to hide the save buttons. */
  savedIds?: ReadonlySet<string>;
  layout?: GridLayout;
}) {
  return (
    <ul className={cn("grid gap-3 sm:gap-5", GRID_COLUMNS[layout])} role="list">
      {listings.map((listing, index) => (
        <li key={listing.id} className="min-w-0">
          <ProductCard listing={listing} priority={index < priorityCount} saved={savedIds ? savedIds.has(listing.id) : undefined} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 10, layout = "full" }: { count?: number; layout?: GridLayout }) {
  return (
    <ul className={cn("grid gap-3 sm:gap-5", GRID_COLUMNS[layout])} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-2xl border bg-card">
          <div className="aspect-[4/3] animate-pulse bg-muted" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="mt-3 h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}
