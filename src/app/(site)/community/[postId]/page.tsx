import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, Lock, MessageSquare, Pin } from "lucide-react";
import { VerificationIndicator } from "@/components/marketplace/badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { requireVerified } from "@/lib/auth/session";
import { formatRelative, initials, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TOPIC_LABELS } from "@/features/community/constants";
import { CommentComposer, CommentThread, ContentMenu } from "@/features/community/components/comment-thread";
import { VoteControl } from "@/features/community/components/vote-control";
import { getPost } from "@/features/community/queries";

export const metadata: Metadata = { title: "Discussion" };

export default async function PostPage({ params, searchParams }: PageProps<"/community/[postId]">) {
  const { postId } = await params;
  const query = await searchParams;
  const viewer = await requireVerified(`/community/${postId}`);
  const sort = query.sort === "new" ? "new" : "best";
  const post = await getPost(postId, viewer.id, sort);
  if (!post) notFound();
  const gone = post.state === "deleted" || post.state === "removed";
  const isOwn = post.authorId === viewer.id;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <p className="mb-4 text-sm"><Link href="/community" className="text-muted-foreground hover:text-foreground">← Community</Link></p>

      {post.state === "under_review" && (
        <div role="status" className="mb-4 rounded-xl border border-warning-foreground/20 bg-warning p-4 text-sm text-warning-foreground">
          <p className="flex items-center gap-2 font-semibold"><EyeOff className="size-4" aria-hidden /> Only you can see this post right now</p>
          <p className="mt-1">It&apos;s waiting for a quick safety check before other students can see it.</p>
          {post.moderationReasons.map((r) => <p key={r.code} className="mt-1">{r.message}</p>)}
        </div>
      )}

      <article className="flex gap-3 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="post-title">
        {!gone && <VoteControl target="post" id={post.id} score={post.score} myVote={post.myVote} disabled={post.state !== "visible"} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Link href={`/community?topic=${post.topic}`} className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground hover:underline">
                {TOPIC_LABELS[post.topic]}
              </Link>
              {post.isPinned && <span className="flex items-center gap-1 font-medium text-success"><Pin className="size-3" aria-hidden /> Pinned</span>}
              {post.isLocked && <span className="flex items-center gap-1"><Lock className="size-3" aria-hidden /> Locked</span>}
              <time dateTime={post.createdAt}>{formatRelative(post.createdAt)}</time>
            </p>
            {!gone && <ContentMenu target="post" id={post.id} isOwn={isOwn} />}
          </div>
          <h1 id="post-title" className={cn("mt-2 text-xl font-semibold tracking-tight sm:text-2xl", gone && "text-muted-foreground italic")}>{post.title}</h1>
          {!gone && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Avatar className="size-6">
                {post.authorAvatarUrl && <AvatarImage src={post.authorAvatarUrl} alt="" />}
                <AvatarFallback className="text-[10px]">{initials(post.authorName ?? "?")}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{post.authorName ?? "Student"}</span>
              <VerificationIndicator verified compact />
            </div>
          )}
          {post.body && <p className="mt-4 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{post.body}</p>}
          {gone && <p className="mt-2 text-sm text-muted-foreground">{post.state === "removed" ? "This post was removed by the moderators." : "This post was deleted by its author."}</p>}
          <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground"><MessageSquare className="size-4" aria-hidden /> {pluralize(post.commentCount, "comment")}</p>
        </div>
      </article>

      <section aria-labelledby="comments-heading" className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="comments-heading" className="font-semibold">Comments</h2>
          <nav aria-label="Sort comments" className="flex gap-1 text-sm">
            {(["best", "new"] as const).map((s) => (
              <Link
                key={s}
                href={s === "best" ? `/community/${post.id}` : `/community/${post.id}?sort=new`}
                aria-current={sort === s ? "page" : undefined}
                className={cn("rounded-full px-3 py-1 font-medium", sort === s ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {s === "best" ? "Best" : "New"}
              </Link>
            ))}
          </nav>
        </div>
        {post.state === "visible" && !post.isLocked && (
          <div className="mb-4 border-b pb-4">
            {viewer.canMessage ? (
              <CommentComposer postId={post.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Your account can&apos;t comment right now.</p>
            )}
          </div>
        )}
        {post.isLocked && <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" aria-hidden /> Comments are locked by the moderators.</p>}
        <CommentThread comments={post.comments} postId={post.id} viewerId={viewer.id} locked={post.isLocked || post.state !== "visible"} />
      </section>
    </div>
  );
}
