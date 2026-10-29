import { SearchX } from "lucide-react";
import { EmptyState, PageContainer } from "@/components/shared/states";

export default function NotFound() {
  return (
    <PageContainer size="md">
      <EmptyState
        icon={SearchX}
        title="We couldn't find that page"
        description="It may have been removed, or you may not have access to it."
        action={{ href: "/marketplace", label: "Browse listings" }}
      />
    </PageContainer>
  );
}
