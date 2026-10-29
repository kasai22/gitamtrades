"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GalleryImage = { id: string; url: string | null; thumbUrl: string | null };

/** ProductImageGallery: keyboard-accessible main image + thumbnail strip. */
export function ProductImageGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const usable = images.filter((i) => i.url);
  if (usable.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
        <div className="text-center text-sm">
          <ImageOff className="mx-auto mb-2 size-8" aria-hidden />
          No photos yet
        </div>
      </div>
    );
  }
  const current = usable[Math.min(index, usable.length - 1)];
  const go = (delta: number) => setIndex((i) => (i + delta + usable.length) % usable.length);

  return (
    <div
      className="grid gap-3"
      role="region"
      aria-roledescription="carousel"
      aria-label={`Photos of ${title}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-muted">
        <Image
          key={current.id}
          src={current.url!}
          alt={`${title}, photo ${index + 1} of ${usable.length}`}
          fill
          unoptimized
          priority
          sizes="(min-width: 1024px) 55vw, 100vw"
          className="object-contain"
        />
        {usable.length > 1 && (
          <>
            <Button variant="secondary" size="icon" className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full shadow" onClick={() => go(-1)} aria-label="Previous photo">
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="secondary" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full shadow" onClick={() => go(1)} aria-label="Next photo">
              <ChevronRight aria-hidden />
            </Button>
            <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white" aria-live="polite">
              {index + 1} / {usable.length}
            </span>
          </>
        )}
      </div>
      {usable.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" role="list">
          {usable.map((image, i) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "relative block size-16 overflow-hidden rounded-lg border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-20",
                  i === index ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
                )}
              >
                <Image src={image.thumbUrl ?? image.url!} alt="" fill unoptimized sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
