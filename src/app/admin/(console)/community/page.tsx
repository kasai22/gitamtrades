import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/states";
import { requirePermission } from "@/lib/auth/admin";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AdminActionDialog, AdminInlineAction } from "@/features/admin/components/admin-action";
import { AdminDataTable, FilterTabs, ModerationFlag } from "@/features/admin/components/admin-ui";
import { TOPIC_LABELS, type Topic } from "@/features/community/constants";
import type { ModerationReason } from "@/features/moderation/engine";

export const metadata: Metadata = { title: "Community moderation" };

const VIEWS = ["review", "recent", "removed"] as const;
type View = (typeof VIEWS)[number];
const LABELS: Record<View, string> = { review: "Under review", recent: "Recent posts", removed: "Removed" };

const codes = (reasons: unknown) => (Array.isArray(reasons) ? (reasons as ModerationReason[]).map((r) => r.code) : []);

export default async function AdminCommunityPage({ searchParams }: PageProps<"/admin/community">) {
  await requirePermission("community.moderate", "/admin/community");
  const params = await searchParams;
  const view: View = VIEWS.includes(params.view as View) ? (params.view as View) : "review";
  const supabase = await createClient();

  let postsQuery = supabase
    .from("forum_posts")
    .select("id, topic, title, score, comment_count, moderation_status, moderation_source, moderation_reasons, is_locked, is_pinned, deleted_at, created_at, author:profiles!forum_posts_author_id_fkey (id, display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (view === "review") postsQuery = postsQuery.eq("moderation_status", "limited");
  else if (view === "removed") postsQuery = postsQuery.eq("moderation_status", "removed");
  else postsQuery = postsQuery.is("deleted_at", null);

  const [{ data: posts }, { data: comments }] = await Promise.all([
    postsQuery,
    view === "recent"
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("forum_comments")
          .select("id, post_id, body, moderation_status, moderation_source, moderation_reasons, created_at, author:profiles!forum_comments_author_id_fkey (id, display_name)")
          .eq("moderation_status", view === "review" ? "limited" : "removed")
          .order("created_at", { ascending: false })
          .limit(100),
  ]);

  return (
    <>
      <PageHeader title="Community" description="Posts and comments held by automated checks or user reports, plus pinning and locking." />
      <FilterTabs active={view} tabs={VIEWS.map((v) => ({ value: v, label: LABELS[v], href: `/admin/community?view=${v}` }))} />

      <h2 className="mb-3 text-lg font-semibold">Posts</h2>
      <AdminDataTable
        rows={posts ?? []}
        rowKey={(p) => p.id}
        empty="Nothing here."
        columns={[
          { key: "title", header: "Post", cell: (p) => <Link className="font-medium text-primary hover:underline" href={`/community/${p.id}`}>{p.title}</Link> },
          { key: "topic", header: "Topic", cell: (p) => TOPIC_LABELS[p.topic as Topic] ?? p.topic },
          { key: "author", header: "Author", cell: (p) => (p.author ? <Link className="hover:underline" href={`/admin/users/${p.author.id}`}>{p.author.display_name}</Link> : "[deleted]") },
          { key: "stats", header: "Score / comments", cell: (p) => `${p.score} / ${p.comment_count}` },
          { key: "flags", header: "Flags", cell: (p) => <ModerationFlag codes={[...codes(p.moderation_reasons), ...(p.is_locked ? ["locked"] : []), ...(p.is_pinned ? ["pinned"] : [])]} /> },
          { key: "when", header: "Posted", cell: (p) => formatDateTime(p.created_at), className: "whitespace-nowrap" },
          {
            key: "actions",
            header: "",
            cell: (p) => (
              <span className="flex flex-wrap gap-1">
                {p.moderation_status !== "clear" && (
                  <AdminActionDialog op="community.moderate" fields={{ target: "post", id: p.id, action: "restore" }} label="Restore" variant="default" title="Restore this post?" reasonLabel="Reason (audit log)" />
                )}
                {p.moderation_status !== "removed" && (
                  <AdminActionDialog op="community.moderate" fields={{ target: "post", id: p.id, action: "remove" }} label="Remove" variant="destructive" title="Remove this post?" description="Its text is cleared for everyone and kept in the moderation log." reasonLabel="Reason (audit log)" confirmLabel="Remove" />
                )}
                {p.moderation_status === "clear" && (
                  <>
                    <AdminInlineAction op="community.moderate" fields={{ target: "post", id: p.id, action: p.is_locked ? "unlock" : "lock" }} label={p.is_locked ? "Unlock" : "Lock"} />
                    <AdminInlineAction op="community.moderate" fields={{ target: "post", id: p.id, action: p.is_pinned ? "unpin" : "pin" }} label={p.is_pinned ? "Unpin" : "Pin"} />
                  </>
                )}
              </span>
            ),
          },
        ]}
      />

      {view !== "recent" && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-semibold">Comments</h2>
          <AdminDataTable
            rows={comments ?? []}
            rowKey={(c) => c.id}
            empty="Nothing here."
            columns={[
              { key: "body", header: "Comment", cell: (c) => <span className="line-clamp-2 max-w-md text-sm">{c.body || <em className="text-muted-foreground">[removed]</em>}</span> },
              { key: "post", header: "Thread", cell: (c) => <Link className="text-primary hover:underline" href={`/community/${c.post_id}`}>Open</Link> },
              { key: "author", header: "Author", cell: (c) => (c.author ? <Link className="hover:underline" href={`/admin/users/${c.author.id}`}>{c.author.display_name}</Link> : "[deleted]") },
              { key: "flags", header: "Flags", cell: (c) => <ModerationFlag codes={codes(c.moderation_reasons)} /> },
              { key: "when", header: "Posted", cell: (c) => formatDateTime(c.created_at), className: "whitespace-nowrap" },
              {
                key: "actions",
                header: "",
                cell: (c) => (
                  <span className="flex gap-1">
                    <AdminActionDialog op="community.moderate" fields={{ target: "comment", id: c.id, action: "restore" }} label="Restore" variant="default" title="Restore this comment?" reasonLabel="Reason (audit log)" />
                    {c.moderation_status !== "removed" && (
                      <AdminActionDialog op="community.moderate" fields={{ target: "comment", id: c.id, action: "remove" }} label="Remove" variant="destructive" title="Remove this comment?" reasonLabel="Reason (audit log)" confirmLabel="Remove" />
                    )}
                  </span>
                ),
              },
            ]}
          />
        </>
      )}
    </>
  );
}
