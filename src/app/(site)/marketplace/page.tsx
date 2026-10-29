import type { Metadata } from "next";
import { requireVerified } from "@/lib/auth/session";
import { DiscoveryView } from "@/features/search/components/discovery-view";
import { parseSearchParams } from "@/features/search/params";

export const metadata: Metadata = { title: "Browse listings" };

export default async function MarketplacePage({ searchParams }: PageProps<"/marketplace">) {
  const viewer = await requireVerified("/marketplace");
  const filters = parseSearchParams(await searchParams);
  return (
    <DiscoveryView
      filters={filters}
      basePath={filters.q ? "/search" : "/marketplace"}
      title={filters.q ? `Results for “${filters.q}”` : "Browse listings"}
      description={viewer.universityName ? `From students at ${viewer.universityName}` : undefined}
      viewerId={viewer.id}
    />
  );
}
