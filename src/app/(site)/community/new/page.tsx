import type { Metadata } from "next";
import Link from "next/link";
import { FormMessage } from "@/components/shared/form";
import { PageContainer, PageHeader } from "@/components/shared/states";
import { requireVerified } from "@/lib/auth/session";
import { isTopic } from "@/features/community/constants";
import { PostForm } from "@/features/community/components/post-form";

export const metadata: Metadata = { title: "Create a post" };

export default async function NewPostPage({ searchParams }: PageProps<"/community/new">) {
  const viewer = await requireVerified("/community/new");
  const params = await searchParams;
  return (
    <PageContainer size="md">
      <PageHeader eyebrow={<Link href="/community" className="hover:underline">← Community</Link>} title="Create a post" description="Visible to verified GITAM students only." />
      {viewer.canMessage ? (
        <PostForm defaultTopic={isTopic(params.topic) ? params.topic : undefined} />
      ) : (
        <FormMessage error="Your account can't post in the community right now. See your account page for details." />
      )}
    </PageContainer>
  );
}
