import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./harness";

let db: TestDb;
let alice: string; // verified seller
let bob: string; // verified buyer
let carol: string; // verified, unrelated student
let unverified: string;
let admin: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser({ email: "alice@example.edu.in", displayName: "Alice", seller: true });
  bob = await db.createUser({ email: "bob@students.example.edu.in", displayName: "Bob" });
  carol = await db.createUser({ email: "carol@example.edu.in", displayName: "Carol", seller: true });
  unverified = await db.createUser({ email: "dave@example.edu.in", verified: false });
  admin = await db.createUser({ email: "ops@example.edu.in", displayName: "Ops", role: "super_admin" });
  // The fixture sellers publish many listings across this file; the rate-limit test lowers it explicitly.
  await db.admin(`update public.policy_versions set config = jsonb_set(config, '{rateLimits,listingsPerDay}', '1000') where is_active`);
});

const count = async (q: { query: TestDb["pg"]["query"] }, sql: string, params: unknown[] = []) =>
  (await q.query<{ n: number }>(`select count(*)::int as n from (${sql}) s`, params)).rows[0].n;

describe("sign-up and identity (AUTH-01, AUTH-02, A-07)", () => {
  it("rejects emails outside the university domain allowlist", async () => {
    const message = await errorOf(db.createUser({ email: "someone@gmail.com" }));
    expect(message).toContain("EMAIL_DOMAIN_NOT_ALLOWED");
  });

  it("requires age confirmation and terms acceptance in sign-up metadata", async () => {
    const message = await errorOf(
      db.admin("insert into auth.users (email, raw_user_meta_data) values ($1, $2)", [
        "eve@example.edu.in",
        JSON.stringify({ display_name: "Eve", terms_version: "v1" }),
      ]),
    );
    expect(message).toContain("AGE_CONFIRMATION_REQUIRED");
  });

  it("exposes only a yes/no domain check to anonymous visitors", async () => {
    const rows = await db.as({ kind: "anon" }, async (q) =>
      (await q.query<{ allowed: boolean }>("select * from public.check_email_domain($1)", ["x@example.edu.in"])).rows,
    );
    expect(rows[0].allowed).toBe(true);
    const denied = await db.as({ kind: "anon" }, async (q) =>
      (await q.query<{ allowed: boolean }>("select * from public.check_email_domain($1)", ["x@yahoo.com"])).rows,
    );
    expect(denied[0].allowed).toBe(false);
  });

  it("marks the profile verified only when Auth confirms the email", async () => {
    const [before] = await db.admin<{ email_verified_at: string | null }>(
      "select email_verified_at from public.profiles where id = $1",
      [unverified],
    );
    expect(before.email_verified_at).toBeNull();
    const id = await db.createUser({ email: "late@example.edu.in", verified: false });
    await db.admin("update auth.users set email_confirmed_at = now() where id = $1", [id]);
    const [after] = await db.admin<{ email_verified_at: string | null }>(
      "select email_verified_at from public.profiles where id = $1",
      [id],
    );
    expect(after.email_verified_at).not.toBeNull();
  });

  it("blocks changing the account email to a non-university domain", async () => {
    const message = await errorOf(db.admin("update auth.users set email = 'alice@gmail.com' where id = $1", [alice]));
    expect(message).toContain("EMAIL_DOMAIN_NOT_ALLOWED");
  });

  it("does not let anonymous visitors read profiles or listings", async () => {
    const message = await errorOf(db.as({ kind: "anon" }, (q) => q.query("select * from public.profiles")));
    expect(message).toContain("permission denied");
    const listings = await errorOf(db.as({ kind: "anon" }, (q) => q.query("select * from public.listings")));
    expect(listings).toContain("permission denied");
  });
});

describe("profiles and private data", () => {
  it("lets verified students see campus profiles but not private data", async () => {
    const visible = await db.as(db.user(bob), (q) => count(q, "select id from public.profiles where id = $1", [alice]));
    expect(visible).toBe(1);
    const privateRows = await db.as(db.user(bob), (q) => count(q, "select id from public.profile_private"));
    expect(privateRows).toBe(1); // only Bob's own row
  });

  it("hides other students' profiles from unverified accounts", async () => {
    const visible = await db.as(db.user(unverified), (q) => count(q, "select id from public.profiles"));
    expect(visible).toBe(1); // only their own
  });

  it("prevents self-service privilege escalation", async () => {
    const roleInsert = await errorOf(
      db.as(db.user(bob), (q) => q.query("insert into public.user_roles (user_id, role) values ($1, 'super_admin')", [bob])),
    );
    expect(roleInsert).toContain("permission denied");
    const sellerFlag = await errorOf(
      db.as(db.user(bob), (q) => q.query("update public.profiles set seller_enabled_at = now() where id = $1", [bob])),
    );
    expect(sellerFlag).toContain("permission denied");
    const university = await errorOf(
      db.as(db.user(bob), (q) =>
        q.query("update public.profiles set university_id = gen_random_uuid() where id = $1", [bob]),
      ),
    );
    expect(university).toContain("permission denied");
  });

  it("allows editing your own display name only", async () => {
    await db.as(db.user(bob), (q) => q.query("update public.profiles set display_name = 'Bobby' where id = $1", [alice]));
    const [row] = await db.admin<{ display_name: string }>("select display_name from public.profiles where id = $1", [alice]);
    expect(row.display_name).toBe("Alice");
  });

  it("enables selling through the self-service RPC (AC-02)", async () => {
    const before = await db.as(db.user(bob), async (q) => (await q.query<{ can_sell: boolean }>("select public.can_sell()")).rows[0].can_sell);
    expect(before).toBe(false);
    await db.as(db.user(bob), (q) => q.query("select public.enable_selling()"));
    const after = await db.as(db.user(bob), async (q) => (await q.query<{ can_sell: boolean }>("select public.can_sell()")).rows[0].can_sell);
    expect(after).toBe(true);
    const unverifiedAttempt = await errorOf(db.as(db.user(unverified), (q) => q.query("select public.enable_selling()")));
    expect(unverifiedAttempt).toContain("NOT_VERIFIED");
  });
});

describe("listings: publishing and visibility (LIST-04, SAFE-01, AC-03, AC-04)", () => {
  it("does not allow clients to write listings directly or call persist_listing", async () => {
    const direct = await errorOf(
      db.as(db.user(alice), (q) =>
        q.query(
          `insert into public.listings (seller_id, university_id, category_id, title, price_inr, condition, status, moderation_status)
           select $1, university_id, (select id from public.categories limit 1), 'Bypass', 1, 'good', 'active', 'clear'
           from public.profiles where id = $1`,
          [alice],
        ),
      ),
    );
    expect(direct).toContain("permission denied");
    const rpc = await errorOf(
      db.as(db.user(alice), (q) => q.query("select public.persist_listing($1, null, '{}', '{}', '{}', '{}')", [alice])),
    );
    expect(rpc).toContain("permission denied");
  });

  it("publishes permitted listings immediately and shows them to other verified students", async () => {
    const result = await db.publishListing(alice, { title: "Casio fx-991ES calculator" });
    expect(result).toMatchObject({ status: "active", moderation_status: "clear" });
    const seen = await db.as(db.user(bob), (q) => count(q, "select id from public.listings where id = $1", [result.listing_id]));
    expect(seen).toBe(1);
    const unverifiedSees = await db.as(db.user(unverified), (q) =>
      count(q, "select id from public.listings where id = $1", [result.listing_id]),
    );
    expect(unverifiedSees).toBe(0);
  });

  it("keeps blocked and limited listings away from other students but visible to the seller", async () => {
    const blocked = await db.publishListing(alice, { title: "Blocked thing", outcome: "block" });
    expect(blocked).toMatchObject({ status: "draft", moderation_status: "blocked" });
    const limited = await db.publishListing(alice, { title: "Limited thing", outcome: "limit" });
    expect(limited).toMatchObject({ status: "active", moderation_status: "limited" });
    for (const id of [blocked.listing_id, limited.listing_id]) {
      expect(await db.as(db.user(bob), (q) => count(q, "select id from public.listings where id = $1", [id]))).toBe(0);
      expect(await db.as(db.user(alice), (q) => count(q, "select id from public.listings where id = $1", [id]))).toBe(1);
      expect(await db.as(db.user(admin), (q) => count(q, "select id from public.listings where id = $1", [id]))).toBe(1);
    }
  });

  it("records the seller declaration and an automated moderation event (LIST-06, SAFE-03)", async () => {
    const result = await db.publishListing(alice, { title: "Desk lamp with LED bulb" });
    const declarations = await db.admin<{ policy_version: string }>(
      "select policy_version from public.listing_declarations where listing_id = $1",
      [result.listing_id],
    );
    expect(declarations).toHaveLength(1);
    const events = await db.admin<{ action: string; rule_version: string }>(
      "select action, rule_version from public.moderation_events where listing_id = $1",
      [result.listing_id],
    );
    expect(events[0]).toMatchObject({ action: "auto_published", rule_version: "p1/e-test" });
  });

  it("is idempotent for retried publish requests", async () => {
    const clientRequestId = "11111111-1111-4111-8111-111111111111";
    const first = await db.publishListing(alice, { title: "Hostel bucket", clientRequestId });
    const second = await db.publishListing(alice, { title: "Hostel bucket", clientRequestId });
    expect(second.listing_id).toBe(first.listing_id);
    expect(second.duplicate_request).toBe(true);
  });

  it("requires ticket transfer confirmation for ticket listings", async () => {
    const message = await errorOf(db.publishListing(alice, { categorySlug: "event-tickets", title: "Fest pass" }));
    expect(message).toContain("TICKET_TRANSFER_CONFIRMATION_REQUIRED");
    const ok = await db.publishListing(alice, { categorySlug: "event-tickets", title: "Fest pass", ticketConfirmed: true });
    expect(ok.status).toBe("active");
  });

  it("does not let sellers without seller permission publish", async () => {
    const buyerOnly = await db.createUser({ email: "buyeronly@example.edu.in" });
    const message = await errorOf(db.publishListing(buyerOnly));
    expect(message).toContain("SELLING_NOT_ENABLED");
  });

  it("does not let edits escape a restriction placed because of reports", async () => {
    const listing = await db.publishListing(alice, { title: "Bluetooth speaker" });
    await db.admin(
      "update public.listings set moderation_status = 'limited', moderation_source = 'user_reports' where id = $1",
      [listing.listing_id],
    );
    const edited = await db.publishListing(alice, { listingId: listing.listing_id, title: "Bluetooth speaker v2" });
    expect(edited.moderation_status).toBe("limited");
  });

  it("hides listings from suspended sellers", async () => {
    const seller = await db.createUser({ email: "suspended@example.edu.in", seller: true });
    const listing = await db.publishListing(seller, { title: "Table fan" });
    expect(await db.as(db.user(bob), (q) => count(q, "select id from public.listings where id = $1", [listing.listing_id]))).toBe(1);
    await db.admin("insert into public.account_restrictions (user_id, kind, reason) values ($1, 'suspension', 'Test suspension')", [seller]);
    expect(await db.as(db.user(bob), (q) => count(q, "select id from public.listings where id = $1", [listing.listing_id]))).toBe(0);
  });

  it("enforces the daily listing rate limit in the database", async () => {
    const seller = await db.createUser({ email: "spammer@example.edu.in", seller: true });
    await db.admin(
      `update public.policy_versions set config = jsonb_set(config, '{rateLimits,listingsPerDay}', '2') where is_active`,
    );
    await db.publishListing(seller, { title: "Item one" });
    await db.publishListing(seller, { title: "Item two" });
    const message = await errorOf(db.publishListing(seller, { title: "Item three" }));
    expect(message).toContain("RATE_LIMITED:listings");
    await db.admin(
      `update public.policy_versions set config = jsonb_set(config, '{rateLimits,listingsPerDay}', '1000') where is_active`,
    );
  });
});

describe("listing lifecycle (LIST-05, LIST-07, AC-09)", () => {
  it("allows the seller to move through valid transitions only", async () => {
    const { listing_id } = await db.publishListing(alice, { title: "Study table" });
    await db.as(db.user(alice), (q) => q.query("select public.change_listing_status($1, 'on_hold')", [listing_id]));
    await db.as(db.user(alice), (q) => q.query("select public.change_listing_status($1, 'sold')", [listing_id]));
    const invalid = await errorOf(
      db.as(db.user(alice), (q) => q.query("select public.change_listing_status($1, 'on_hold')", [listing_id])),
    );
    expect(invalid).toContain("INVALID_TRANSITION");
    const [row] = await db.admin<{ status: string; sold_at: string | null }>(
      "select status, sold_at from public.listings where id = $1",
      [listing_id],
    );
    expect(row.status).toBe("sold");
    expect(row.sold_at).not.toBeNull();
  });

  it("does not let other users change someone else's listing (IDOR)", async () => {
    const { listing_id } = await db.publishListing(alice, { title: "Mattress" });
    const message = await errorOf(
      db.as(db.user(bob), (q) => q.query("select public.change_listing_status($1, 'removed')", [listing_id])),
    );
    expect(message).toContain("LISTING_NOT_FOUND");
  });

  it("treats past-expiry listings as expired and lets the seller renew them", async () => {
    const { listing_id } = await db.publishListing(alice, { title: "Old cycle helmet" });
    await db.admin("update public.listings set expires_at = now() - interval '1 day' where id = $1", [listing_id]);
    const searchHit = await db.as(db.user(bob), (q) =>
      count(q, "select id from public.search_listings('helmet')"),
    );
    expect(searchHit).toBe(0);
    await db.as(db.user(alice), (q) => q.query("select public.renew_listing($1)", [listing_id]));
    expect(await db.as(db.user(bob), (q) => count(q, "select id from public.search_listings('helmet')"))).toBe(1);
  });

  it("sold listings drop out of discovery but the detail stays readable", async () => {
    const { listing_id } = await db.publishListing(alice, { title: "Badminton racket Yonex" });
    expect(await db.as(db.user(bob), (q) => count(q, "select id from public.search_listings('yonex')"))).toBe(1);
    await db.as(db.user(alice), (q) => q.query("select public.change_listing_status($1, 'sold')", [listing_id]));
    expect(await db.as(db.user(bob), (q) => count(q, "select id from public.search_listings('yonex')"))).toBe(0);
    expect(await db.as(db.user(bob), (q) => count(q, "select id from public.listings where id = $1", [listing_id]))).toBe(1);
  });
});

describe("discovery (DISC-02, DISC-03)", () => {
  it("supports prefix search, category, price and condition filters", async () => {
    await db.publishListing(carol, { title: "Organic chemistry handbook", price: 400 });
    await db.publishListing(carol, { title: "Chemistry lab coat", price: 0, categorySlug: "clothing-accessories" });
    const rows = await db.as(db.user(bob), async (q) =>
      (await q.query<{ title: string; total_count: number }>("select title, total_count from public.search_listings('chem')")).rows,
    );
    expect(rows.map((r) => r.title).sort()).toEqual(["Chemistry lab coat", "Organic chemistry handbook"]);
    expect(Number(rows[0].total_count)).toBe(2);

    const free = await db.as(db.user(bob), async (q) =>
      (await q.query<{ title: string }>("select title from public.search_listings('chem', null, null, 0)")).rows,
    );
    expect(free.map((r) => r.title)).toEqual(["Chemistry lab coat"]);

    const category = await db.as(db.user(bob), async (q) =>
      (await q.query<{ title: string }>("select title from public.search_listings('chem', 'books-study-materials')")).rows,
    );
    expect(category.map((r) => r.title)).toEqual(["Organic chemistry handbook"]);

    const priceSorted = await db.as(db.user(bob), async (q) =>
      (await q.query<{ price_inr: number }>(
        "select price_inr from public.search_listings('chem', null, null, null, array['good']::public.item_condition[], false, 'price_desc')",
      )).rows,
    );
    expect(priceSorted.map((r) => r.price_inr)).toEqual([400, 0]);
  });

  it("returns nothing for unverified users and handles empty/garbage queries", async () => {
    expect(await db.as(db.user(unverified), (q) => count(q, "select id from public.search_listings(null)"))).toBe(0);
    const garbage = await db.as(db.user(bob), (q) => count(q, "select id from public.search_listings('!!! ***')"));
    expect(garbage).toBeGreaterThan(0); // no usable terms → behaves like browse
  });

  it("hides listings from sellers the viewer has blocked", async () => {
    const seller = await db.createUser({ email: "blockedseller@example.edu.in", seller: true });
    await db.publishListing(seller, { title: "Unique zebra lamp" });
    const viewer = await db.createUser({ email: "viewer@example.edu.in" });
    expect(await db.as(db.user(viewer), (q) => count(q, "select id from public.search_listings('zebra')"))).toBe(1);
    await db.as(db.user(viewer), (q) => q.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [viewer, seller]));
    expect(await db.as(db.user(viewer), (q) => count(q, "select id from public.search_listings('zebra')"))).toBe(0);
  });
});

describe("messaging (CHAT-01, CHAT-03, AC-06)", () => {
  let listingId: string;
  let conversationId: string;

  beforeAll(async () => {
    listingId = (await db.publishListing(alice, { title: "Electric kettle 1.5L" })).listing_id;
  });

  it("starts one conversation per buyer and listing (idempotent)", async () => {
    conversationId = await db.as(db.user(bob), async (q) =>
      (await q.query<{ id: string }>("select public.start_conversation($1) as id", [listingId])).rows[0].id,
    );
    const again = await db.as(db.user(bob), async (q) =>
      (await q.query<{ id: string }>("select public.start_conversation($1) as id", [listingId])).rows[0].id,
    );
    expect(again).toBe(conversationId);
    const own = await errorOf(db.as(db.user(alice), (q) => q.query("select public.start_conversation($1)", [listingId])));
    expect(own).toContain("CANNOT_MESSAGE_OWN_LISTING");
  });

  it("lets participants exchange messages and keeps others out", async () => {
    await db.as(db.user(bob), (q) =>
      q.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Is it available?')", [conversationId, bob]),
    );
    await db.as(db.user(alice), (q) =>
      q.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Yes!')", [conversationId, alice]),
    );
    expect(await db.as(db.user(alice), (q) => count(q, "select id from public.messages where conversation_id = $1", [conversationId]))).toBe(2);
    expect(await db.as(db.user(carol), (q) => count(q, "select id from public.messages where conversation_id = $1", [conversationId]))).toBe(0);
    expect(await db.as(db.user(carol), (q) => count(q, "select id from public.conversations where id = $1", [conversationId]))).toBe(0);
    const intrusion = await errorOf(
      db.as(db.user(carol), (q) =>
        q.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hi')", [conversationId, carol]),
      ),
    );
    expect(intrusion).toContain("row-level security");
    const spoof = await errorOf(
      db.as(db.user(bob), (q) =>
        q.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'spoof')", [conversationId, alice]),
      ),
    );
    expect(spoof).toContain("row-level security");
    const system = await errorOf(
      db.as(db.user(bob), (q) =>
        q.query("insert into public.messages (conversation_id, sender_id, kind, body) values ($1, $2, 'system', 'x')", [conversationId, bob]),
      ),
    );
    expect(system).toContain("row-level security");
  });

  it("de-duplicates retried sends by client id", async () => {
    const clientId = "22222222-2222-4222-8222-222222222222";
    const insert = (q: { query: TestDb["pg"]["query"] }) =>
      q.query(
        `insert into public.messages (conversation_id, sender_id, body, client_id) values ($1, $2, 'retry', $3)
         on conflict (conversation_id, client_id) do nothing`,
        [conversationId, bob, clientId],
      );
    await db.as(db.user(bob), insert);
    await db.as(db.user(bob), insert);
    expect(await db.as(db.user(bob), (q) => count(q, "select id from public.messages where client_id = $1", [clientId]))).toBe(1);
  });

  it("tracks unread state per participant", async () => {
    const unreadFor = (id: string) =>
      db.as(db.user(id), async (q) => (await q.query<{ n: number }>("select public.unread_conversation_count() as n")).rows[0].n);
    // Bob sent the most recent message (the retry), so it is unread for Alice and read for Bob.
    expect(await unreadFor(alice)).toBe(1);
    expect(await unreadFor(bob)).toBe(0);
    await db.as(db.user(alice), (q) => q.query("select public.mark_conversation_read($1)", [conversationId]));
    expect(await unreadFor(alice)).toBe(0);
  });

  it("stops blocked users from sending new messages but keeps the history", async () => {
    await db.as(db.user(alice), (q) => q.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [alice, bob]));
    const blocked = await errorOf(
      db.as(db.user(bob), (q) =>
        q.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hello?')", [conversationId, bob]),
      ),
    );
    expect(blocked).toContain("row-level security");
    expect(await db.as(db.user(bob), (q) => count(q, "select id from public.messages where conversation_id = $1", [conversationId]))).toBeGreaterThan(0);
    // Bob cannot see who blocked him.
    expect(await db.as(db.user(bob), (q) => count(q, "select * from public.blocks"))).toBe(0);
    await db.as(db.user(alice), (q) => q.query("delete from public.blocks where blocker_id = $1", [alice]));
  });

  it("refuses new conversations on sold listings but keeps existing ones working", async () => {
    await db.as(db.user(alice), (q) => q.query("select public.change_listing_status($1, 'sold')", [listingId]));
    const message = await errorOf(db.as(db.user(carol), (q) => q.query("select public.start_conversation($1)", [listingId])));
    expect(message).toContain("LISTING_NOT_AVAILABLE");
    const existing = await db.as(db.user(bob), async (q) =>
      (await q.query<{ id: string }>("select public.start_conversation($1) as id", [listingId])).rows[0].id,
    );
    expect(existing).toBe(conversationId);
  });

  it("does not let unverified users start conversations", async () => {
    const other = (await db.publishListing(carol, { title: "Yoga mat" })).listing_id;
    const message = await errorOf(db.as(db.user(unverified), (q) => q.query("select public.start_conversation($1)", [other])));
    expect(message).toContain("NOT_VERIFIED");
  });

  it("rate-limits messages per minute", async () => {
    await db.admin(`update public.policy_versions set config = jsonb_set(config, '{rateLimits,messagesPerMinute}', '3') where is_active`);
    const listing = (await db.publishListing(carol, { title: "Rate limit test item" })).listing_id;
    const sender = await db.createUser({ email: "chatty@example.edu.in" });
    const conv = await db.as(db.user(sender), async (q) =>
      (await q.query<{ id: string }>("select public.start_conversation($1) as id", [listing])).rows[0].id,
    );
    const send = () =>
      db.as(db.user(sender), (q) =>
        q.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hey')", [conv, sender]),
      );
    await send();
    await send();
    await send();
    expect(await errorOf(send())).toContain("RATE_LIMITED:messages");
    await db.admin(`update public.policy_versions set config = jsonb_set(config, '{rateLimits,messagesPerMinute}', '20') where is_active`);
  });
});

describe("reports and appeals (SAFE-02, SAFE-03, SAFE-04, AC-10, AC-12)", () => {
  it("creates a traceable case, de-duplicates repeats and hides the reporter from the seller", async () => {
    const { listing_id } = await db.publishListing(alice, { title: "Suspicious phone" });
    const first = await db.as(db.user(bob), async (q) =>
      (await q.query<{ case_number: string; already_reported: boolean }>(
        "select * from public.submit_report('listing', $1, 'scam', 'Asked for advance payment')",
        [listing_id],
      )).rows[0],
    );
    expect(first.case_number).toMatch(/^R-\d{6}$/);
    expect(first.already_reported).toBe(false);
    const repeat = await db.as(db.user(bob), async (q) =>
      (await q.query<{ case_number: string; already_reported: boolean }>(
        "select * from public.submit_report('listing', $1, 'scam', null)",
        [listing_id],
      )).rows[0],
    );
    expect(repeat).toMatchObject({ case_number: first.case_number, already_reported: true });
    expect(await db.as(db.user(alice), (q) => count(q, "select id from public.reports"))).toBe(0);
    expect(await db.as(db.user(admin), (q) => count(q, "select id from public.reports where listing_id = $1", [listing_id]))).toBe(1);
  });

  it("auto-limits a listing once enough independent high-severity reports arrive", async () => {
    const { listing_id } = await db.publishListing(alice, { title: "Too good to be true laptop" });
    await db.as(db.user(bob), (q) => q.query("select * from public.submit_report('listing', $1, 'counterfeit', null)", [listing_id]));
    // The same reporter reporting again must not count twice.
    await db.as(db.user(bob), (q) => q.query("select * from public.submit_report('listing', $1, 'scam', null)", [listing_id]));
    let [row] = await db.admin<{ moderation_status: string }>("select moderation_status from public.listings where id = $1", [listing_id]);
    expect(row.moderation_status).toBe("clear");
    await db.as(db.user(carol), (q) => q.query("select * from public.submit_report('listing', $1, 'scam', null)", [listing_id]));
    [row] = await db.admin<{ moderation_status: string }>("select moderation_status from public.listings where id = $1", [listing_id]);
    expect(row.moderation_status).toBe("limited");
    const events = await db.admin<{ action: string }>("select action from public.moderation_events where listing_id = $1 and action = 'report_auto_limited'", [listing_id]);
    expect(events).toHaveLength(1);
  });

  it("snapshots reported message content as evidence", async () => {
    const listing = (await db.publishListing(carol, { title: "Football boots" })).listing_id;
    const conv = await db.as(db.user(bob), async (q) =>
      (await q.query<{ id: string }>("select public.start_conversation($1) as id", [listing])).rows[0].id,
    );
    const messageId = await db.as(db.user(carol), async (q) =>
      (await q.query<{ id: string }>(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Pay me first on UPI') returning id",
        [conv, carol],
      )).rows[0].id,
    );
    await db.as(db.user(bob), (q) => q.query("select * from public.submit_report('message', $1, 'scam', null)", [messageId]));
    const [report] = await db.admin<{ evidence: { body: string }; reported_user_id: string }>(
      "select evidence, reported_user_id from public.reports where message_id = $1",
      [messageId],
    );
    expect(report.evidence.body).toBe("Pay me first on UPI");
    expect(report.reported_user_id).toBe(carol);
    const outsider = await errorOf(
      db.as(db.user(alice), (q) => q.query("select * from public.submit_report('message', $1, 'scam', null)", [messageId])),
    );
    expect(outsider).toContain("TARGET_NOT_FOUND");
  });

  it("allows appeals only for your own restricted listings and returns a case id", async () => {
    const blocked = await db.publishListing(alice, { title: "Appealable item", outcome: "block" });
    const appeal = await db.as(db.user(alice), async (q) =>
      (await q.query<{ case_number: string }>(
        "select * from public.submit_appeal($1, null, 'This is a legitimate textbook, please review.')",
        [blocked.listing_id],
      )).rows[0],
    );
    expect(appeal.case_number).toMatch(/^A-\d{6}$/);
    const notMine = await errorOf(
      db.as(db.user(bob), (q) =>
        q.query("select * from public.submit_appeal($1, null, 'Please review this listing now.')", [blocked.listing_id]),
      ),
    );
    expect(notMine).toContain("NOTHING_TO_APPEAL");
  });
});

describe("staff-only data (ADMIN-01, AC-11)", () => {
  it("keeps moderation, audit and analytics tables staff-only", async () => {
    for (const table of ["moderation_events", "admin_audit_logs", "analytics_events", "policy_versions"]) {
      expect(await db.as(db.user(bob), (q) => count(q, `select * from public.${table}`))).toBe(0);
    }
    expect(await db.as(db.user(admin), (q) => count(q, "select * from public.moderation_events"))).toBeGreaterThan(0);
    const metrics = await errorOf(db.as(db.user(bob), (q) => q.query("select public.admin_metrics(7)")));
    expect(metrics).toContain("FORBIDDEN");
    const adminMetrics = await db.as(db.user(admin), async (q) =>
      (await q.query<{ m: Record<string, number> }>("select public.admin_metrics(7) as m")).rows[0].m,
    );
    expect(adminMetrics.active_listings).toBeGreaterThan(0);
  });
});

describe("storage policies (LIST-03)", () => {
  it("keeps unpublished images private and exposes them once the listing is visible", async () => {
    const path = `${alice}/photo-1.webp`;
    const thumb = `${alice}/photo-1_thumb.webp`;
    await db.as(db.user(alice), (q) =>
      q.query("insert into storage.objects (bucket_id, name, owner) values ('listing-images', $1, $2), ('listing-images', $3, $2)", [path, alice, thumb]),
    );
    const [image] = await db.admin<{ id: string }>(
      "insert into public.listing_images (owner_id, storage_path, thumb_path, content_hash) values ($1, $2, $3, 'h1') returning id",
      [alice, path, thumb],
    );
    const objectsVisibleToBob = () =>
      db.as(db.user(bob), (q) => count(q, "select id from storage.objects where name = $1", [path]));
    expect(await objectsVisibleToBob()).toBe(0);
    await db.publishListing(alice, { title: "Listing with a photo", imageIds: [image.id] });
    expect(await objectsVisibleToBob()).toBe(1);
  });

  it("prevents uploading into another user's folder", async () => {
    const message = await errorOf(
      db.as(db.user(bob), (q) =>
        q.query("insert into storage.objects (bucket_id, name, owner) values ('listing-images', $1, $2)", [`${alice}/evil.webp`, bob]),
      ),
    );
    expect(message).toContain("row-level security");
  });

  it("rejects attaching another seller's image to your listing", async () => {
    const [image] = await db.admin<{ id: string }>(
      "insert into public.listing_images (owner_id, storage_path, thumb_path, content_hash) values ($1, 'x/a.webp', 'x/a_t.webp', 'h2') returning id",
      [carol],
    );
    const message = await errorOf(db.publishListing(alice, { title: "Stolen image", imageIds: [image.id] }));
    expect(message).toContain("IMAGE_NOT_OWNED");
  });
});
