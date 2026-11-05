import type { MetadataRoute } from "next";
import { PUBLIC_INDEXABLE_PATHS, siteUrl } from "@/lib/seo";

/** Only the public pages. Listings, community posts and accounts need a verified student login. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_INDEXABLE_PATHS.map((path) => ({
    url: path === "/" ? `${siteUrl}/` : `${siteUrl}${path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/signup" ? 0.8 : 0.5,
  }));
}
