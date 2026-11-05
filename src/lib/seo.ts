import type { Metadata } from "next";

/**
 * Search-engine settings. The root layout keeps every page out of search results by default
 * (listings, chats and accounts are only for verified students). Pages that anyone can read
 * opt back in with `publicPageMetadata`, and only those pages are listed in the sitemap.
 */

/** Public origin, without a trailing slash. Set NEXT_PUBLIC_SITE_URL to the production domain. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Pages that signed-out visitors can open and that search engines may list. */
export const PUBLIC_INDEXABLE_PATHS = [
  "/",
  "/signup",
  "/help",
  "/safety",
  "/policies/prohibited-items",
  "/terms",
  "/privacy",
  "/grievance",
] as const;

export type PublicIndexablePath = (typeof PUBLIC_INDEXABLE_PATHS)[number];

/** Metadata for a public page: allows indexing and sets the canonical URL. */
export function publicPageMetadata(
  path: PublicIndexablePath,
  meta: { title: Metadata["title"]; description: string },
): Metadata {
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
  };
}
