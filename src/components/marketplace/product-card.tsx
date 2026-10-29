import Image from "next/image";
import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";
import { CONDITION_LABELS } from "@/features/listings/constants";
import type { ListingCard } from "@/features/listings/queries";
import { features } from "@/lib/config";
import { formatRelative } from "@/lib/format";
import { ListingStatusBadge, PriceDisplay } from "./badges";

export function ProductCard({ listing, priority = false }: { listing: ListingCard; priority?: boolean }) {
  const unavailable = listing.status !== "active";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {listing.thumbUrl ? (
          <Image
            src={listing.thumbUrl}
            alt=""
            fill
            unoptimized
            priority={priority}
            sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" aria-hidden />
            <span className="sr-only">No photo</span>
          </div>
        )}
        {unavailable && (
          <div className="absolute top-2 left-2">
            <ListingStatusBadge status={listing.status} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <PriceDisplay priceInr={listing.priceInr} />
        <h3 className="line-clamp-2 text-sm leading-snug font-medium">
          <Link href={`/listings/${listing.id}`} className="outline-none after:absolute after:inset-0">
            {listing.title}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground">
          {CONDITION_LABELS[listing.condition]} · {listing.categoryName}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            {features.meetupAreas && listing.meetupAreaName && (
              <>
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{listing.meetupAreaName}</span>
              </>
            )}
          </span>
          {listing.publishedAt && <time dateTime={listing.publishedAt} className="shrink-0">{formatRelative(listing.publishedAt)}</time>}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ listings, priorityCount = 0 }: { listings: ListingCard[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" role="list">
      {listings.map((listing, index) => (
        <li key={listing.id} className="flex">
          <div className="w-full">
            <ProductCard listing={listing} priority={index < priorityCount} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border bg-card">
          <div className="aspect-[4/3] animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}
