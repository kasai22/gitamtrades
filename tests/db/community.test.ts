import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./harness";

let db: TestDb;
let asha: string;
let ravi: string;
let meena: string;
let unverified: string;
let staff: string;

beforeAll(async () => {
  db = await createTestDb();
  asha = await db.createUser({ email: "asha@student.gitam.edu", displayName: "Asha" });
  ravi = await db.createUser({ email: "ravi@student.gitam.edu", displayName: "Ravi" });
  meena = await db.createUser({ email: "meena@student.gitam.edu", displayName: "Meena" });
  unverified = await db.createUser({ email: "new@student.gitam.edu", verified: false });
  staff = await db.createUser({ email: "mod@student.gitam.edu", displayName: "Mod", role: "moderator" });
});

/** The server writes posts/comments with the service role after automated checks. */
const createPost = (author: string, title = "Best place to print assignments?", extra: Record<string, unknown> = {}) =>
  db.as({ kind: "service" }, async (q) => {
    const cols = ["author_id", "topic", "title", "body", ...Object.keys(extra)];
    const values = [author, "academics", title, "Looking for a cheap printer near campus.", ...Object.values(extra)];
    const res = await q.query<{ id: string }>(
      `insert into public.forum_posts (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      values,
    );
    return res.rows[0].id;
  });

const createComment = (author: string, postId: string, parentId: string | null = null, body = "Try the library basement.") =>
  db.as({ kind: "service" }, async (q) =>
    (await q.query<{ id: string; depth: number }>(
      "insert into public.forum_comments (post_id, parent_id, author_id, body) values ($1, $2, $3, $4) returning id, depth",
      [postId, parentId, author, body],
    )).rows[0],
  );

const count = async (actor: string, sql: string, params: unknown[] = []) =>
  db.as(db.user(actor), async (q) => (await q.query<{ n: number }>(`select count(*)::int as n from (${sql}) s`, params)).rows[0].n);

describe("community posts and threads", () => {
  it("clients cannot write posts or comments directly (moderation can't be bypassed)", async () => {
    const message = await errorOf(
      db.as(db.user(asha), (q) =>
        q.query("insert into public.forum_posts (author_id, topic, title) values ($1, 'general', 'Direct insert')", [asha]),
      ),
    );
    expect(message).toContain("permission denied");
  });

  it("shows clear posts to verified students only, and in the feed", async () => {
    const id = await createPost(asha, "Anyone selling a drafter?");
    expect(await count(ravi, "select id from public.forum_posts where id = $1", [id])).toBe(1);
    expect(await count(unverified, "select id from public.forum_posts where id = $1", [id])).toBe(0);
    const feed = await db.as(db.user(ravi), async (q) =>
      (await q.query<{ title: string; author_name: string }>("select title, author_name from public.list_forum_posts()")).rows,
    );
    expect(feed.map((p) => p.title)).toContain("Anyone selling a drafter?");
  });

  it("keeps posts under review visible only to the author and staff", async () => {
    const id = await createPost(asha, "Under review post", { moderation_status: "limited" });
    expect(await count(ravi, "select id from public.forum_posts where id = $1", [id])).toBe(0);
    expect(await count(asha, "select id from public.forum_posts where id = $1", [id])).toBe(1);
    expect(await count(staff, "select id from public.forum_posts where id = $1", [id])).toBe(1);
  });

  it("rejects posts from unverified or restricted students", async () => {
    expect(await errorOf(createPost(unverified))).toContain("NOT_VERIFIED");
    const muted = await db.createUser({ email: "muted@student.gitam.edu" });
    await db.admin("insert into public.account_restrictions (user_id, kind, reason) values ($1, 'messaging_ban', 'Spam')", [muted]);
    expect(await errorOf(createPost(muted))).toContain("COMMUNITY_RESTRICTED");
  });

  it("nests replies, tracks depth and comment counts, and caps thread depth", async () => {
    const postId = await createPost(asha, "Thread depth test");
    let parent = await createComment(ravi, postId);
    expect(parent.depth).toBe(0);
    for (let i = 1; i <= 8; i++) {
      parent = await createComment(i % 2 ? asha : ravi, postId, parent.id, `Reply ${i}`);
      expect(parent.depth).toBe(i);
    }
    expect(await errorOf(createComment(ravi, postId, parent.id))).toContain("THREAD_TOO_DEEP");
    const [post] = await db.admin<{ comment_count: number }>("select comment_count from public.forum_posts where id = $1", [postId]);
    expect(post.comment_count).toBe(9);
  });

  it("refuses replies on locked posts and parents from other posts", async () => {
    const a = await createPost(asha, "Locked post");
    const b = await createPost(asha, "Other post");
    const foreign = await createComment(ravi, b);
    expect(await errorOf(createComment(ravi, a, foreign.id))).toContain("PARENT_NOT_FOUND");
    await db.admin("update public.forum_posts set is_locked = true where id = $1", [a]);
    expect(await errorOf(createComment(ravi, a))).toContain("POST_LOCKED");
  });

  it("rate-limits posts per day", async () => {
    const spammer = await db.createUser({ email: "spam@student.gitam.edu" });
    for (let i = 0; i < 10; i++) await createPost(spammer, `Post number ${i}`);
    expect(await errorOf(createPost(spammer, "One too many"))).toContain("RATE_LIMITED:posts");
  });
});

describe("community votes", () => {
  it("maintains scores from one vote per student and ignores forged scores", async () => {
    const postId = await createPost(asha, "Vote on this");
    const vote = (user: string, value: number) =>
      db.as(db.user(user), (q) =>
        q.query(
          `insert into public.forum_post_votes (user_id, post_id, value) values ($1, $2, $3)
           on conflict (user_id, post_id) do update set value = excluded.value`,
          [user, postId, value],
        ),
      );
    await vote(ravi, 1);
    await vote(meena, 1);
    await vote(meena, -1); // changed mind
    const score = async () => (await db.admin<{ score: number }>("select score from public.forum_posts where id = $1", [postId]))[0].score;
    expect(await score()).toBe(0);
    await db.as(db.user(meena), (q) => q.query("delete from public.forum_post_votes where user_id = $1 and post_id = $2", [meena, postId]));
    expect(await score()).toBe(1);

    const forged = await errorOf(
      db.as(db.user(ravi), (q) => q.query("insert into public.forum_post_votes (user_id, post_id, value) values ($1, $2, 1)", [meena, postId])),
    );
    expect(forged).toContain("row-level security");
    const tooMuch = await errorOf(
      db.as(db.user(meena), (q) => q.query("insert into public.forum_post_votes (user_id, post_id, value) values ($1, $2, 5)", [meena, postId])),
    );
    expect(tooMuch).toContain("check constraint");
    const scoreWrite = await errorOf(db.as(db.user(ravi), (q) => q.query("update public.forum_posts set score = 999 where id = $1", [postId])));
    expect(scoreWrite).toContain("permission denied");
  });

  it("sorts the feed by top score", async () => {
    const top = await db.as(db.user(ravi), async (q) =>
      (await q.query<{ score: number }>("select score from public.list_forum_posts(null, 'top', 5)")).rows,
    );
    const scores = top.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("community reports and deletion", () => {
  it("reports posts and comments with case numbers and auto-hides after independent reports", async () => {
    const postId = await createPost(asha, "Selling notes, pay in advance");
    const first = await db.as(db.user(ravi), async (q) =>
      (await q.query<{ case_number: string; already_reported: boolean }>("select * from public.submit_report('post', $1, 'scam', null)", [postId])).rows[0],
    );
    expect(first.case_number).toMatch(/^R-\d{6}$/);
    const again = await db.as(db.user(ravi), async (q) =>
      (await q.query<{ already_reported: boolean }>("select * from public.submit_report('post', $1, 'scam', null)", [postId])).rows[0],
    );
    expect(again.already_reported).toBe(true);
    await db.as(db.user(meena), (q) => q.query("select * from public.submit_report('post', $1, 'scam', null)", [postId]));
    const [post] = await db.admin<{ moderation_status: string }>("select moderation_status from public.forum_posts where id = $1", [postId]);
    expect(post.moderation_status).toBe("limited");

    const otherPost = await createPost(asha, "Hostel wifi tips");
    const comment = await createComment(ravi, otherPost, null, "You're an idiot");
    const report = await db.as(db.user(asha), async (q) =>
      (await q.query<{ case_number: string }>("select * from public.submit_report('comment', $1, 'harassment', null)", [comment.id])).rows[0],
    );
    expect(report.case_number).toMatch(/^R-/);
    const [row] = await db.admin<{ evidence: { body: string }; reported_user_id: string; post_id: string }>(
      "select evidence, reported_user_id, post_id from public.reports where comment_id = $1",
      [comment.id],
    );
    expect(row).toMatchObject({ evidence: { body: "You're an idiot" }, reported_user_id: ravi, post_id: otherPost });
    expect(await errorOf(db.as(db.user(ravi), (q) => q.query("select * from public.submit_report('comment', $1, 'spam', null)", [comment.id])))).toContain(
      "CANNOT_REPORT_SELF",
    );
  });

  it("anonymises a deleted account's posts and comments but keeps the thread", async () => {
    const leaver = await db.createUser({ email: "leaver@student.gitam.edu", displayName: "Leaver" });
    const postId = await createPost(leaver, "My last post");
    const reply = await createComment(asha, postId, null, "Thanks!");
    const own = await createComment(leaver, postId, reply.id, "You're welcome");
    await db.admin("delete from auth.users where id = $1", [leaver]);
    const [post] = await db.admin<{ title: string; body: string; author_id: string | null; deleted_at: string | null }>(
      "select title, body, author_id, deleted_at from public.forum_posts where id = $1",
      [postId],
    );
    expect(post).toMatchObject({ title: "[deleted]", body: "", author_id: null });
    expect(post.deleted_at).not.toBeNull();
    const comments = await db.admin<{ id: string; body: string; author_id: string | null }>(
      "select id, body, author_id from public.forum_comments where post_id = $1 order by created_at",
      [postId],
    );
    expect(comments).toEqual([
      { id: reply.id, body: "Thanks!", author_id: asha },
      { id: own.id, body: "", author_id: null },
    ]);
  });
});
