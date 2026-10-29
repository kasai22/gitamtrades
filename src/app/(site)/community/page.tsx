import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Lock, MessageSquare, Pin, Plus, Sparkles, TrendingUp } from "lucide-react";
import { EmptyState, Pagination } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { requireVerified } from "@/lib/auth/session";
import { formatRelative, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FEED_SORTS, TOPICS, TOPIC_LABELS, isTopic, type FeedSort } from "@/features/community/constants";
import { VoteControl } from "@/features/community/components/vote-control";
import { listPosts } from "@/features/community/queries";

export const metadata: Metadata = { title: "Community" };

const SORT_ICONS = { hot: Flame, new: Sparkles, top: TrendingUp } as const;

export default async function CommunityPage({ searchParams }: PageProps<"/community">) {
  await requireVerified("/community");
  const params = await searchParams;
  const topic = isTopic(params.topic) ? params.topic : null;
  const sort: FeedSort = params.sort === "new" || params.sort === "top" ? params.sort : "hot";
  const pageRaw = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 500) : 1;
  const { posts, total, pageCount } = await listPosts({ topic, sort, page });

  const href = (patch: { topic?: string | null; sort?: FeedSort; page?: number }) => {
    const search = new URLSearchParams();
    const t = patch.topic === undefined ? topic : patch.topic;
    const s = patch.sort ?? sort;
    if (t) search.set("topic", t);
    if (s !== "hot") search.set("sort", s);
    if (patch.page && patch.page > 1) search.set("page", String(patch.page));
    const query = search.toString();
    return query ? `/community?${query}` : "/community";
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{topic ? TOPIC_LABELS[topic] : "Community"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {topic ? TOPICS.find((t) => t.value === topic)?.description : "Ask questions, share tips and talk with fellow GITAM students."} · {pluralize(total, "post")}
          </p>
        </div>
        <Button asChild>
          <Link href={topic ? `/community/new?topic=${topic}` : "/community/new"}><Plus aria-hidden /> Create post</Link>
        </Button>
      </div>

      <nav aria-label="Topics" className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2" role="list">
          {[{ value: null, label: "All" }, ...TOPICS].map((t) => (
            <li key={t.value ?? "all"}>
              <Link
                href={href({ topic: t.value, page: 1 })}
                aria-current={topic === t.value ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-full border bg-card px-4 text-sm font-medium whitespace-nowrap hover:bg-muted",
                  topic === t.value && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Sort posts" className="mb-4 flex gap-1 border-b">
        {FEED_SORTS.map((s) => {
          const Icon = SORT_ICONS[s.value];
          return (
            <Link
              key={s.value}
              href={href({ sort: s.value, page: 1 })}
              aria-current={sort === s.value ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                sort === s.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden /> {s.label}
            </Link>
          );
        })}
      </nav>

      {posts.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No posts yet"
          description="Start the first discussion: ask about a course, share a hostel tip or post a lost & found."
          action={{ href: topic ? `/community/new?topic=${topic}` : "/community/new", label: "Create post" }}
        />
      ) : (
        <ul className="grid gap-3" role="list">
          {posts.map((post) => (
            <li key={post.id}>
              <article className="relative flex gap-3 rounded-xl border bg-card p-3 transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-sm sm:p-4">
                <div className="relative z-10">
                  <VoteControl target="post" id={post.id} score={post.score} myVote={post.myVote} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {post.isPinned && sort === "hot" && !topic && (
                      <span className="flex items-center gap-1 font-medium text-success"><Pin className="size-3" aria-hidden /> Pinned</span>
                    )}
                    <Link href={href({ topic: post.topic, page: 1 })} className="relative z-10 rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground hover:underline">
                      {TOPIC_LABELS[post.topic]}
                    </Link>
                    <span>{post.authorName ?? "[deleted]"}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={post.createdAt}>{formatRelative(post.createdAt)}</time>
                    {post.isLocked && <span className="flex items-center gap-1"><Lock className="size-3" aria-hidden /> Locked</span>}
                  </p>
                  <h2 className="mt-1 text-base leading-snug font-semibold">
                    <Link href={`/community/${post.id}`} className="outline-none after:absolute after:inset-0">{post.title}</Link>
                  </h2>
                  {post.preview && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.preview}</p>}
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MessageSquare className="size-3.5" aria-hidden /> {pluralize(post.commentCount, "comment")}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={pageCount} hrefFor={(p) => href({ page: p })} />
    </div>
  );
}
