import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { ProductGrid } from "@/components/marketplace/product-card";
import { EmptyState, PageHeader } from "@/components/shared/states";
import { requireVerified } from "@/lib/auth/session";
import { getFavouriteListings } from "@/features/listings/queries";

export const metadata: Metadata = { title: "Saved items" };

export default async function FavouritesPage() {
  const viewer = await requireVerified("/account/favourites");
  const listings = await getFavouriteListings(viewer.id);
  return (
    <>
      <PageHeader title="Saved items" description="Saved on your account, so they follow you to any device." />
      {listings.length === 0 ? (
        <EmptyState icon={Heart} title="Nothing saved yet" description="Tap Save on a listing to keep track of it." action={{ href: "/marketplace", label: "Browse listings" }} />
      ) : (
        <ProductGrid listings={listings} />
      )}
    </>
  );
}
