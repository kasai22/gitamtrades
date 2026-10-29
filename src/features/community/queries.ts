import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET, signPaths } from "@/lib/storage";
import type { ModerationReason } from "@/features/moderation/engine";
import type { ModerationStatus } from "@/features/listings/constants";
import { FEED_PAGE_SIZE, type FeedSort, type Topic } from "./constants";

export type PostSummary = {
  id: string;
  topic: Topic;
  title: string;
  preview: string;
  score: number;
  commentCount: number;
  authorName: string | null;
  createdAt: string;
  isPinned: boolean;
  isLocked: boolean;
  myVote: -1 | 0 | 1;
};

export async function listPosts(options: { topic: Topic | null; sort: FeedSort; page: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_forum_posts", {
    p_topic: options.topic,
    p_sort: options.sort,
    p_limit: FEED_PAGE_SIZE,
    p_offset: (options.page - 1) * FEED_PAGE_SIZE,
  });
  if (error) throw new Error(`list_forum_posts failed: ${error.message}`);
  const rows = data ?? [];
  const posts: PostSummary[] = rows.map((r) => ({
    id: r.id!,
    topic: r.topic as Topic,
    title: r.title!,
    preview: r.body_preview ?? "",
    score: r.score ?? 0,
    commentCount: r.comment_count ?? 0,
    authorName: r.author_name,
    createdAt: r.created_at!,
    isPinned: Boolean(r.is_pinned),
    isLocked: Boolean(r.is_locked),
    myVote: (r.my_vote ?? 0) as -1 | 0 | 1,
  }));
  const total = Number(rows[0]?.total_count ?? 0);
  return { posts, total, page: options.page, pageCount: Math.max(1, Math.ceil(total / FEED_PAGE_SIZE)) };
}

export type ThreadComment = {
  id: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  depth: number;
  score: number;
  myVote: -1 | 0 | 1;
  createdAt: string;
  state: "visible" | "deleted" | "removed" | "under_review";
  children: ThreadComment[];
};

export type PostDetail = {
  id: string;
  topic: Topic;
  title: string;
  body: string;
  score: number;
  commentCount: number;
  authorId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  createdAt: string;
  isLocked: boolean;
  isPinned: boolean;
  myVote: -1 | 0 | 1;
  state: "visible" | "deleted" | "removed" | "under_review";
  moderationStatus: ModerationStatus;
  moderationReasons: ModerationReason[];
  comments: ThreadComment[];
};

type CommentSort = "best" | "new";
const MAX_COMMENTS = 1000;

function stateOf(row: { deleted_at: string | null; moderation_status: string }): ThreadComment["state"] {
  if (row.deleted_at) return "deleted";
  if (row.moderation_status === "removed") return "removed";
  if (row.moderation_status === "limited") return "under_review";
  return "visible";
}

/** A post with its full comment tree, as visible to the current user (RLS decides visibility). */
export async function getPost(postId: string, viewerId: string, sort: CommentSort = "best"): Promise<PostDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("forum_posts")
    .select(
      `id, topic, title, body, score, comment_count, author_id, created_at, is_locked, is_pinned, deleted_at,
       moderation_status, moderation_reasons, author:profiles!forum_posts_author_id_fkey (display_name, avatar_path)`,
    )
    .eq("id", postId)
    .maybeSingle();
  if (!post) return null;

  const [{ data: comments }, { data: postVote }] = await Promise.all([
    supabase
      .from("forum_comments")
      .select("id, parent_id, author_id, body, depth, score, created_at, deleted_at, moderation_status, author:profiles!forum_comments_author_id_fkey (display_name, avatar_path)")
      .eq("post_id", postId)
      .order("created_at")
      .limit(MAX_COMMENTS),
    supabase.from("forum_post_votes").select("value").eq("post_id", postId).eq("user_id", viewerId).maybeSingle(),
  ]);
  const rows = comments ?? [];
  const commentIds = rows.map((c) => c.id);
  const { data: commentVotes } = commentIds.length
    ? await supabase.from("forum_comment_votes").select("comment_id, value").eq("user_id", viewerId).in("comment_id", commentIds)
    : { data: [] as { comment_id: string; value: number }[] };
  const votes = new Map((commentVotes ?? []).map((v) => [v.comment_id, v.value as -1 | 1]));
  const avatars = await signPaths(supabase, AVATAR_BUCKET, [post.author?.avatar_path, ...rows.map((c) => c.author?.avatar_path)]);

  const nodes = new Map<string, ThreadComment>();
  for (const c of rows) {
    const state = stateOf(c);
    const hidden = state === "deleted" || state === "removed";
    nodes.set(c.id, {
      id: c.id,
      parentId: c.parent_id,
      authorId: hidden ? null : c.author_id,
      authorName: hidden ? null : (c.author?.display_name ?? null),
      authorAvatarUrl: hidden || !c.author?.avatar_path ? null : (avatars.get(c.author.avatar_path) ?? null),
      body: hidden ? "" : c.body,
      depth: c.depth,
      score: c.score,
      myVote: votes.get(c.id) ?? 0,
      createdAt: c.created_at,
      state,
      children: [],
    });
  }
  const roots: ThreadComment[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else if (!node.parentId) roots.push(node);
  }
  const compare = (a: ThreadComment, b: ThreadComment) =>
    sort === "new" ? b.createdAt.localeCompare(a.createdAt) : b.score - a.score || a.createdAt.localeCompare(b.createdAt);
  const prune = (list: ThreadComment[]): ThreadComment[] =>
    list
      .map((n) => ({ ...n, children: prune(n.children) }))
      // Drop deleted/removed leaves; keep them as placeholders only when they have replies.
      .filter((n) => n.state === "visible" || n.state === "under_review" || n.children.length > 0)
      .sort(compare);

  const state = stateOf(post);
  const hidden = state === "deleted" || state === "removed";
  return {
    id: post.id,
    topic: post.topic as Topic,
    title: hidden ? (state === "removed" ? "[removed]" : "[deleted]") : post.title,
    body: hidden ? "" : post.body,
    score: post.score,
    commentCount: post.comment_count,
    authorId: hidden ? null : post.author_id,
    authorName: hidden ? null : (post.author?.display_name ?? null),
    authorAvatarUrl: !hidden && post.author?.avatar_path ? (avatars.get(post.author.avatar_path) ?? null) : null,
    createdAt: post.created_at,
    isLocked: post.is_locked,
    isPinned: post.is_pinned,
    myVote: (postVote?.value ?? 0) as -1 | 0 | 1,
    state,
    moderationStatus: post.moderation_status,
    moderationReasons: Array.isArray(post.moderation_reasons) ? (post.moderation_reasons as unknown as ModerationReason[]) : [],
    comments: prune(roots),
  };
}
