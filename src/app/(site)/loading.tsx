import { ProductGridSkeleton } from "@/components/marketplace/product-card";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" role="status" aria-label="Loading">
      <div className="mb-6 h-8 w-56 animate-pulse rounded-lg bg-muted" />
      <ProductGridSkeleton />
    </div>
  );
}
