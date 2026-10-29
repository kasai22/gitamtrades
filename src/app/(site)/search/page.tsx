import type { Metadata } from "next";
import { requireVerified } from "@/lib/auth/session";
import { DiscoveryView } from "@/features/search/components/discovery-view";
import { parseSearchParams } from "@/features/search/params";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const viewer = await requireVerified("/search");
  const filters = parseSearchParams(await searchParams);
  return (
    <DiscoveryView
      filters={filters}
      basePath="/search"
      title={filters.q ? `Results for “${filters.q}”` : "Search listings"}
      viewerId={viewer.id}
    />
  );
}
