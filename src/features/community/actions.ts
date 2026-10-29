"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getViewer } from "@/lib/auth/session";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformSettings } from "@/features/admin/settings";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { evaluateCommunityText, type ModerationReason } from "@/features/moderation/engine";
import { loadActivePolicy } from "@/features/moderation/server";
import { MAX_COMMENT_BODY, MAX_POST_BODY, MAX_POST_TITLE, TOPIC_VALUES } from "./constants";

const uuid = z.uuid();

export type PostFormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  reasons?: ModerationReason[];
  values?: { title: string; topic: string; body: string };
} | null;

const postSchema = z.object({
  title: z.string().trim().min(3, "Add a title (at least 3 characters).").max(MAX_POST_TITLE, `Keep the title under ${MAX_POST_TITLE} characters.`),
  topic: z.enum(TOPIC_VALUES, { message: "Choose a topic." }),
  body: z.string().trim().max(MAX_POST_BODY, `Keep the post under ${MAX_POST_BODY.toLocaleString("en-IN")} characters.`),
});

type Member = { viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>> } | { error: string };

async function requireCommunityMember(): Promise<Member> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in again." };
  if (!viewer.isVerified) return { error: friendlyError({ message: "NOT_VERIFIED" }) };
  // A messaging restriction also covers community posts and comments.
  if (!viewer.canMessage) return { error: friendlyError({ message: "COMMUNITY_RESTRICTED" }) };
  if ((await getPlatformSettings()).communityPostingPaused) return { error: friendlyError({ message: "COMMUNITY_PAUSED" }) };
  return { viewer };
}

/**
 * Create a community post. Automated checks run first: blocked content is not saved (the author gets
 * the reasons and can edit); review-worthy content is saved hidden until a moderator checks it.
 */
export async function createPost(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const values = { title: String(formData.get("title") ?? ""), topic: String(formData.get("topic") ?? ""), body: String(formData.get("body") ?? "") };
  const auth = await requireCommunityMember();
  if ("error" in auth) return { error: auth.error, values };
  const parsed = postSchema.safeParse(values);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors, values };

  const policy = await loadActivePolicy();
  const decision = evaluateCommunityText({ title: parsed.data.title, body: parsed.data.body }, { policy: policy.config, policyVersion: policy.version });
  if (decision.outcome === "block") {
    return { error: "Your post wasn't published. Fix the issue below and try again.", reasons: decision.reasons, values };
  }

  const admin = createAdminClient();
  const limited = decision.outcome === "limit";
  const { data, error } = await admin
    .from("forum_posts")
    .insert({
      author_id: auth.viewer.id,
      // Overwritten by the forum_posts_guard trigger from the author's profile.
      university_id: auth.viewer.universityId,
      topic: parsed.data.topic,
      title: parsed.data.title,
      body: parsed.data.body,
      moderation_status: limited ? "limited" : "clear",
      moderation_source: limited ? "automated_check" : null,
      moderation_reasons: decision.reasons as unknown as Json,
      moderation_rule_version: decision.ruleVersion,
    })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Couldn't publish your post. Try again."), values };

  if (limited) {
    await admin.from("moderation_events").insert({
      forum_post_id: data.id,
      subject_user_id: auth.viewer.id,
      action: "auto_limited",
      source: "automated_check",
      reason_codes: decision.reasons.map((r) => r.code),
      rule_version: decision.ruleVersion,
    });
  }
  track("community_post_created", auth.viewer.id, { post_id: data.id, topic: parsed.data.topic, outcome: decision.outcome });
  revalidatePath("/community");
  redirect(`/community/${data.id}`);
}

const commentSchema = z.object({
  postId: uuid,
  parentId: uuid.nullable(),
  body: z.string().trim().min(1, "Write a comment first.").max(MAX_COMMENT_BODY, `Keep it under ${MAX_COMMENT_BODY.toLocaleString("en-IN")} characters.`),
});

export type CommentResult = ActionResult<{ id: string; underReview: boolean }> & { reasons?: ModerationReason[] };

export async function createComment(input: z.input<typeof commentSchema>): Promise<CommentResult> {
  const auth = await requireCommunityMember();
  if ("error" in auth) return fail(auth.error);
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid comment.");

  // The post must be visible to this student (RLS) before the server writes on their behalf.
  const supabase = await createClient();
  const { data: post } = await supabase.from("forum_posts").select("id, is_locked, moderation_status, deleted_at").eq("id", parsed.data.postId).maybeSingle();
  if (!post || post.deleted_at || post.moderation_status !== "clear") return fail("This post isn't available.");
  if (post.is_locked) return fail("This thread is locked by the moderators.");

  const policy = await loadActivePolicy();
  const decision = evaluateCommunityText({ body: parsed.data.body }, { policy: policy.config, policyVersion: policy.version });
  if (decision.outcome === "block") {
    return { ...fail(decision.reasons[0]?.message ?? "This comment breaks the community rules."), reasons: decision.reasons };
  }
  const limited = decision.outcome === "limit";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("forum_comments")
    .insert({
      post_id: parsed.data.postId,
      parent_id: parsed.data.parentId,
      author_id: auth.viewer.id,
      body: parsed.data.body,
      moderation_status: limited ? "limited" : "clear",
      moderation_source: limited ? "automated_check" : null,
      moderation_reasons: decision.reasons as unknown as Json,
      moderation_rule_version: decision.ruleVersion,
    })
    .select("id")
    .single();
  if (error || !data) return fail(friendlyError(error, "Couldn't post your comment. Try again."));
  if (limited) {
    await admin.from("moderation_events").insert({
      forum_post_id: parsed.data.postId,
      forum_comment_id: data.id,
      subject_user_id: auth.viewer.id,
      action: "auto_limited",
      source: "automated_check",
      reason_codes: decision.reasons.map((r) => r.code),
      rule_version: decision.ruleVersion,
    });
  }
  track("community_comment_created", auth.viewer.id, { post_id: parsed.data.postId, is_reply: parsed.data.parentId !== null, outcome: decision.outcome });
  revalidatePath(`/community/${parsed.data.postId}`);
  return ok({ id: data.id, underReview: limited }, limited ? "Posted. It's hidden from others until a quick safety check." : "Comment posted.");
}

const voteSchema = z.object({ target: z.enum(["post", "comment"]), id: uuid, value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });

/** One vote per student per post/comment; scores are maintained by a database trigger. */
export async function vote(input: z.input<typeof voteSchema>): Promise<ActionResult<{ value: number }>> {
  const viewer = await getViewer();
  if (!viewer?.isVerified) return fail(friendlyError({ message: "NOT_VERIFIED" }));
  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid vote.");
  const { target, id, value } = parsed.data;
  const supabase = await createClient();
  let error;
  if (target === "post") {
    ({ error } =
      value === 0
        ? await supabase.from("forum_post_votes").delete().eq("user_id", viewer.id).eq("post_id", id)
        : await supabase.from("forum_post_votes").upsert({ user_id: viewer.id, post_id: id, value }, { onConflict: "user_id,post_id" }));
  } else {
    ({ error } =
      value === 0
        ? await supabase.from("forum_comment_votes").delete().eq("user_id", viewer.id).eq("comment_id", id)
        : await supabase.from("forum_comment_votes").upsert({ user_id: viewer.id, comment_id: id, value }, { onConflict: "user_id,comment_id" }));
  }
  if (error) return fail("Couldn't record your vote.");
  return ok({ value });
}

/** Authors can delete their own post or comment; it stays in the thread as "[deleted]". */
export async function deleteOwnContent(target: "post" | "comment", id: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  if (!uuid.safeParse(id).success) return fail("Not found.");
  const admin = createAdminClient();
  const table = target === "post" ? "forum_posts" : "forum_comments";
  const { data: row } = await admin.from(table).select("id, author_id").eq("id", id).maybeSingle();
  if (!row || row.author_id !== viewer.id) return fail("You can only delete your own posts and comments.");
  const now = new Date().toISOString();
  const { error } =
    target === "post"
      ? await admin.from("forum_posts").update({ title: "[deleted]", body: "", deleted_at: now }).eq("id", id)
      : await admin.from("forum_comments").update({ body: "", deleted_at: now }).eq("id", id);
  if (error) return fail("Couldn't delete it. Try again.");
  revalidatePath("/community");
  return ok(undefined, "Deleted.");
}
