import { notFound } from "next/navigation";
import { requireVerified } from "@/lib/auth/session";
import { getCategories } from "@/features/listings/queries";
import { DiscoveryView } from "@/features/search/components/discovery-view";
import { parseSearchParams } from "@/features/search/params";

export default async function CategoryPage({ params, searchParams }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const viewer = await requireVerified(`/categories/${slug}`);
  const category = (await getCategories()).find((c) => c.slug === slug);
  if (!category) notFound();
  const filters = parseSearchParams(await searchParams, category.slug);
  return (
    <DiscoveryView
      filters={filters}
      basePath={`/categories/${category.slug}`}
      title={category.name}
      description={category.description ?? undefined}
      fixedCategory
      viewerId={viewer.id}
    />
  );
}
