import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/**
 * Crawlers (search engines and AI search bots alike) may fetch the site. Private pages are not
 * blocked here on purpose: they redirect signed-out visitors to /login, which carries a noindex
 * tag, and crawlers can only see that tag if they are allowed to fetch the page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/auth/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
