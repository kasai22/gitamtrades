import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN_ROLES, ROLE_PERMISSIONS } from "../../src/lib/auth/permissions";
import { createTestDb, errorOf, type Actor, type TestDb } from "./harness";

/**
 * Admin platform boundaries enforced by the database itself (docs/ADMIN_DATA_BOUNDARIES.md):
 * permission matrix, permission-aware RLS, server-only admin functions that re-check the actor,
 * guard rails, append-only audit records, reported-conversation access and platform switches.
 */
let db: TestDb;
let seller: string;
let buyer: string;
let student: string;
let superAdmin: string;
let superAdmin2: string;
let moderator: string;
let support: string;
let analyst: string;
let listingId: string;
let reportId: string;
let conversationId: string;

const service: Actor = { kind: "service" };
const rows = async <T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []) =>
  db.as(actor, async (q) => (await q.query<T>(sql, params)).rows);
const one = async <T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []) => (await rows<T>(actor, sql, params))[0];

async function auditCount(action: string, actorId?: string) {
  const [row] = await db.admin<{ n: number }>(
    `select count(*)::int as n from public.admin_audit_logs where action = $1 and ($2::uuid is null or actor_id = $2)`,
    [action, actorId ?? null],
  );
  return row.n;
}

beforeAll(async () => {
  db = await createTestDb();
  seller = await db.createUser({ email: "seller@example.edu.in", displayName: "Seller", seller: true });
  buyer = await db.createUser({ email: "buyer@example.edu.in", displayName: "Buyer" });
  student = await db.createUser({ email: "student@example.edu.in", displayName: "Student" });
  superAdmin = await db.createUser({ email: "root@example.edu.in", displayName: "Root", role: "super_admin" });
  superAdmin2 = await db.createUser({ email: "root2@example.edu.in", displayName: "Root Two", role: "super_admin" });
  moderator = await db.createUser({ email: "mod@example.edu.in", displayName: "Mod", role: "moderator" });
  support = await db.createUser({ email: "support@example.edu.in", displayName: "Support", role: "support_admin" });
  analyst = await db.createUser({ email: "analyst@example.edu.in", displayName: "Analyst", role: "analyst" });
  await db.admin(`update public.policy_versions set config = jsonb_set(config, '{rateLimits,listingsPerDay}', '1000') where is_active`);

  const published = await db.publishListing(seller, { title: "Desk lamp" });
  listingId = published.listing_id;
  conversationId = await db.as(db.user(buyer), async (q) => (await q.query<{ id: string }>("select public.start_conversation($1) as id", [listingId])).rows[0].id);
  await rows(db.user(buyer), "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Is this still available?')", [conversationId, buyer]);
  await rows(db.user(seller), "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Yes, pay me in advance')", [conversationId, seller]);
  const report = await one<{ report_id: string }>(db.user(buyer), "select * from public.submit_report('listing', $1, 'scam', 'Asked for advance payment')", [listingId]);
  reportId = report.report_id;
});

describe("permission catalogue", () => {
  it("matches the TypeScript matrix exactly", async () => {
    const dbRows = await db.admin<{ role: string; permission: string }>("select role::text, permission from public.admin_role_permissions order by 1, 2");
    const expected = ADMIN_ROLES.flatMap((role) => ROLE_PERMISSIONS[role].map((permission) => ({ role, permission }))).sort((a, b) =>
      a.role === b.role ? a.permission.localeCompare(b.permission) : a.role.localeCompare(b.role),
    );
    expect(dbRows).toEqual(expected);
  });

  it("evaluates has_permission from user_roles and denies students", async () => {
    const check = async (id: string, permission: string) => (await one<{ ok: boolean }>(db.user(id), "select public.has_permission($1) as ok", [permission])).ok;
    expect(await check(superAdmin, "roles.manage")).toBe(true);
    expect(await check(moderator, "listings.moderate")).toBe(true);
    expect(await check(moderator, "roles.manage")).toBe(false);
    expect(await check(support, "users.view_contact")).toBe(true);
    expect(await check(support, "users.restrict")).toBe(false);
    expect(await check(analyst, "analytics.view")).toBe(true);
    expect(await check(analyst, "users.view")).toBe(false);
    expect(await check(student, "overview.view")).toBe(false);
  });

  it("does not let students enumerate staff through actor_has_permission", async () => {
    const message = await errorOf(rows(db.user(student), "select public.actor_has_permission($1, 'roles.manage')", [superAdmin]));
    expect(message).toContain("permission denied");
  });
});

describe("unauthenticated and student access", () => {
  it("refuses admin reads to anonymous visitors", async () => {
    expect(await errorOf(rows({ kind: "anon" }, "select public.admin_overview(current_date - 7, current_date)"))).toContain("permission denied");
    expect(await errorOf(rows({ kind: "anon" }, "select * from public.reports"))).toContain("permission denied");
    expect(await errorOf(rows({ kind: "anon" }, "select * from public.admin_audit_logs"))).toContain("permission denied");
  });

  it("raises FORBIDDEN when a student calls permission-checked admin reads", async () => {
    expect(await errorOf(rows(db.user(student), "select public.admin_overview(current_date - 7, current_date)"))).toContain("FORBIDDEN");
    expect(await errorOf(rows(db.user(student), "select * from public.admin_list_users()"))).toContain("FORBIDDEN");
    expect(await errorOf(rows(db.user(student), "select * from public.admin_list_reports()"))).toContain("FORBIDDEN");
    expect(await errorOf(rows(db.user(student), "select * from public.admin_search_conversations($1)", [conversationId]))).toContain("FORBIDDEN");
  });

  it("never lets clients execute admin mutations, even with their own id as the actor", async () => {
    const message = await errorOf(
      rows(db.user(superAdmin), "select public.admin_moderate_listings($1, array[$2]::uuid[], 'remove', 'testing')", [superAdmin, listingId]),
    );
    expect(message).toContain("permission denied");
    expect(await errorOf(rows(db.user(student), "select public.admin_set_role($1, $1, 'super_admin', true, 'escalate')", [student]))).toContain("permission denied");
  });

  it("cannot self-assign roles or write audit records directly", async () => {
    expect(await errorOf(rows(db.user(student), "insert into public.user_roles (user_id, role) values ($1, 'moderator')", [student]))).toContain("permission denied");
    expect(await errorOf(rows(db.user(superAdmin), "insert into public.admin_audit_logs (action, target_type) values ('x', 'y')"))).toContain("permission denied");
  });

  it("hides the reports table from reporters; they read their own cases without triage fields", async () => {
    expect(await rows(db.user(buyer), "select * from public.reports")).toHaveLength(0);
    const cases = await rows<Record<string, unknown>>(db.user(buyer), "select * from public.my_report_cases()");
    expect(cases).toHaveLength(1);
    expect(Object.keys(cases[0]).sort()).toEqual(["case_number", "created_at", "id", "reason", "resolution_summary", "resolved_at", "status", "target_type"]);
    expect(await rows(db.user(seller), "select * from public.my_report_cases()")).toHaveLength(0);
  });
});

describe("role-scoped reads (RLS)", () => {
  it("scopes reports, notes and audit logs by permission", async () => {
    expect(await rows(db.user(moderator), "select id from public.reports")).toHaveLength(1);
    expect(await rows(db.user(support), "select id from public.reports")).toHaveLength(1);
    expect(await rows(db.user(analyst), "select id from public.reports")).toHaveLength(0);
    await rows(service, "select public.admin_write_audit($1, 'admin.signed_in', 'session', $2)", [moderator, moderator]);
    expect(await rows(db.user(moderator), "select id from public.admin_audit_logs")).toHaveLength(0);
    expect((await rows(db.user(superAdmin), "select id from public.admin_audit_logs")).length).toBeGreaterThan(0);
  });

  it("lets support investigate users but keeps analysts to aggregates", async () => {
    expect((await rows(db.user(support), "select * from public.admin_list_users()")).length).toBeGreaterThan(5);
    expect(await errorOf(rows(db.user(analyst), "select * from public.admin_list_users()"))).toContain("FORBIDDEN");
    const analytics = await one<{ a: { series: unknown[] } }>(db.user(analyst), "select public.admin_analytics(current_date - 6, current_date) as a");
    expect(analytics.a.series).toHaveLength(7);
    expect(await errorOf(rows(db.user(support), "select public.admin_analytics(current_date - 6, current_date)"))).toContain("FORBIDDEN");
  });

  it("gives no admin role direct access to private messages", async () => {
    for (const id of [superAdmin, moderator, support, analyst]) {
      expect(await rows(db.user(id), "select id from public.messages where conversation_id = $1", [conversationId])).toHaveLength(0);
    }
    expect(await rows(db.user(buyer), "select id from public.messages where conversation_id = $1", [conversationId])).toHaveLength(2);
  });
});

describe("listing moderation", () => {
  it("publishes normal listings immediately without approval", async () => {
    const listing = await one<{ status: string; moderation_status: string }>(service, "select status, moderation_status from public.listings where id = $1", [listingId]);
    expect(listing).toEqual({ status: "active", moderation_status: "clear" });
    expect(await rows(db.user(student), "select id from public.listings where id = $1", [listingId])).toHaveLength(1);
  });

  it("re-checks the actor's permission inside the database", async () => {
    const asAnalyst = await errorOf(rows(service, "select public.admin_moderate_listings($1, array[$2]::uuid[], 'quarantine', 'checking')", [analyst, listingId]));
    expect(asAnalyst).toContain("FORBIDDEN");
    const asSupport = await errorOf(rows(service, "select public.admin_moderate_listings($1, array[$2]::uuid[], 'remove', 'checking')", [support, listingId]));
    expect(asSupport).toContain("FORBIDDEN");
  });

  it("quarantines atomically with a moderation event and an audit record, hiding the listing from students", async () => {
    const before = await auditCount("listing.quarantine", moderator);
    const updated = await one<{ n: number }>(service, "select public.admin_moderate_listings($1, array[$2]::uuid[], 'quarantine', 'Possible scam, investigating', '[]', $3) as n", [moderator, listingId, reportId]);
    expect(updated.n).toBe(1);
    expect(await auditCount("listing.quarantine", moderator)).toBe(before + 1);
    const [event] = await db.admin<{ action: string; actor_id: string }>("select action, actor_id from public.moderation_events where listing_id = $1 order by created_at desc limit 1", [listingId]);
    expect(event).toEqual({ action: "admin_limited", actor_id: moderator });
    expect(await rows(db.user(student), "select id from public.listings where id = $1", [listingId])).toHaveLength(0);
    expect(await rows(db.user(support), "select id from public.listings where id = $1", [listingId])).toHaveLength(1);
    // Restore makes it visible again.
    await rows(service, "select public.admin_moderate_listings($1, array[$2]::uuid[], 'restore', 'Cleared after review')", [moderator, listingId]);
    expect(await rows(db.user(student), "select id from public.listings where id = $1", [listingId])).toHaveLength(1);
  });

  it("refuses a linked report that is about another listing", async () => {
    const other = await db.publishListing(seller, { title: "Office chair" });
    const message = await errorOf(rows(service, "select public.admin_moderate_listings($1, array[$2]::uuid[], 'remove', 'wrong case', '[]', $3, 'x')", [moderator, other.listing_id, reportId]));
    expect(message).toContain("REPORT_MISMATCH");
  });

  it("limits bulk actions to 50 listings and records a batch", async () => {
    const tooMany = Array.from({ length: 51 }, () => crypto.randomUUID());
    expect(await errorOf(rows(service, "select public.admin_moderate_listings($1, $2::uuid[], 'remove', 'bulk')", [moderator, tooMany]))).toContain("BULK_LIMIT");
    const a = await db.publishListing(seller, { title: "Spam one" });
    const b = await db.publishListing(seller, { title: "Spam two" });
    const result = await one<{ n: number }>(service, "select public.admin_moderate_listings($1, array[$2, $3]::uuid[], 'remove', 'Spam listings') as n", [moderator, a.listing_id, b.listing_id]);
    expect(result.n).toBe(2);
    expect(await auditCount("listing.bulk_remove", moderator)).toBe(1);
  });
});

describe("account restrictions", () => {
  it("blocks restricting yourself and lets only role managers restrict staff", async () => {
    expect(await errorOf(rows(service, "select public.admin_restrict_user($1, $1, 'suspension', 'self')", [moderator]))).toContain("CANNOT_TARGET_SELF");
    expect(await errorOf(rows(service, "select public.admin_restrict_user($1, $2, 'suspension', 'staff')", [moderator, support]))).toContain("TARGET_IS_STAFF");
    expect(await errorOf(rows(service, "select public.admin_restrict_user($1, $2, 'suspension', 'x')", [support, student]))).toContain("FORBIDDEN");
  });

  it("stops a suspended student from selling or messaging", async () => {
    const restrictionId = (await one<{ id: string }>(service, "select public.admin_restrict_user($1, $2, 'suspension', 'Repeated scam attempts', 7) as id", [moderator, seller])).id;
    expect(await auditCount("user.restrict.suspension", moderator)).toBe(1);
    expect((await one<{ ok: boolean }>(db.user(seller), "select public.can_sell() as ok")).ok).toBe(false);
    expect(await errorOf(rows(db.user(seller), "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hello')", [conversationId, seller]))).toMatch(/row-level security|NOT_VERIFIED/);
    expect(await rows(db.user(student), "select id from public.listings where seller_id = $1", [seller])).toHaveLength(0);
    await rows(service, "select public.admin_lift_restriction($1, $2, 'Appeal accepted')", [moderator, restrictionId]);
    expect((await one<{ ok: boolean }>(db.user(seller), "select public.can_sell() as ok")).ok).toBe(true);
  });

  it("removes every admin permission from a suspended staff account", async () => {
    await rows(service, "select public.admin_restrict_user($1, $2, 'suspension', 'Account compromised', 1)", [superAdmin, moderator]);
    expect((await one<{ ok: boolean }>(db.user(moderator), "select public.has_permission('reports.view') as ok")).ok).toBe(false);
    expect(await rows(db.user(moderator), "select id from public.reports")).toHaveLength(0);
    expect(await errorOf(rows(service, "select public.admin_moderate_listings($1, array[$2]::uuid[], 'quarantine', 'x')", [moderator, listingId]))).toContain("FORBIDDEN");
    await db.admin("update public.account_restrictions set lifted_at = now(), lift_reason = 'test' where user_id = $1", [moderator]);
  });
});

describe("roles", () => {
  it("only lets role managers change roles, never their own", async () => {
    expect(await errorOf(rows(service, "select public.admin_set_role($1, $2, 'moderator', true, 'promote')", [moderator, student]))).toContain("FORBIDDEN");
    expect(await errorOf(rows(service, "select public.admin_set_role($1, $1, 'analyst', true, 'self')", [superAdmin]))).toContain("CANNOT_TARGET_SELF");
    const unverified = await db.createUser({ email: "new@example.edu.in", verified: false });
    expect(await errorOf(rows(service, "select public.admin_set_role($1, $2, 'moderator', true, 'new hire')", [superAdmin, unverified]))).toContain("TARGET_NOT_ELIGIBLE");
    await rows(service, "select public.admin_set_role($1, $2, 'analyst', true, 'Pilot metrics')", [superAdmin, student]);
    expect(await auditCount("role.granted", superAdmin)).toBe(1);
    await rows(service, "select public.admin_set_role($1, $2, 'analyst', false, 'Pilot over')", [superAdmin, student]);
  });

  it("never removes the last active Super Admin", async () => {
    await rows(service, "select public.admin_set_role($1, $2, 'super_admin', false, 'Stepping down')", [superAdmin, superAdmin2]);
    const message = await errorOf(db.admin("delete from public.user_roles where user_id = $1 and role = 'super_admin'", [superAdmin]));
    expect(message).toContain("LAST_SUPER_ADMIN");
  });
});

describe("audit log", () => {
  it("is append-only, even for the service role and the table owner", async () => {
    const [entry] = await db.admin<{ id: string }>("select id from public.admin_audit_logs limit 1");
    expect(await errorOf(rows(service, "update public.admin_audit_logs set reason = 'edited' where id = $1", [entry.id]))).toContain("permission denied");
    expect(await errorOf(rows(service, "delete from public.admin_audit_logs where id = $1", [entry.id]))).toContain("permission denied");
    expect(await errorOf(db.admin("update public.admin_audit_logs set reason = 'edited' where id = $1", [entry.id]))).toContain("APPEND_ONLY");
    expect(await errorOf(db.admin("delete from public.admin_audit_logs where id = $1", [entry.id]))).toContain("APPEND_ONLY");
  });

  it("records the actor's roles and denied attempts", async () => {
    await rows(service, "select public.admin_record_denied($1, 'page.roles.manage', 'roles.manage')", [analyst]);
    await rows(service, "select public.admin_record_denied($1, 'page.roles.manage', 'roles.manage')", [student]);
    const denied = await db.admin<{ actor_id: string; actor_roles: string[] }>("select actor_id, actor_roles from public.admin_audit_logs where outcome = 'denied'");
    expect(denied).toEqual([{ actor_id: analyst, actor_roles: ["analyst"] }]);
  });
});

describe("report investigation", () => {
  it("moves a case through triage and resolution with reporter-visible outcome only", async () => {
    expect(await errorOf(rows(service, "select public.admin_update_report($1, $2, '{\"status\":\"actioned\"}')", [support, reportId]))).toContain("FORBIDDEN");
    expect(await errorOf(rows(service, "select public.admin_update_report($1, $2, $3)", [moderator, reportId, JSON.stringify({ assigned_to: analyst })]))).toContain("INVALID_ASSIGNEE");
    await rows(service, "select public.admin_update_report($1, $2, $3)", [moderator, reportId, JSON.stringify({ assigned_to: moderator, priority: 4 })]);
    let report = await one<{ status: string; priority: number; assigned_to: string }>(service, "select status, priority, assigned_to from public.reports where id = $1", [reportId]);
    expect(report).toEqual({ status: "in_review", priority: 4, assigned_to: moderator });

    await rows(service, "select public.admin_add_report_note($1, $2, 'Seller asked for advance payment in chat')", [support, reportId]);
    expect(await rows(db.user(support), "select id from public.report_notes where report_id = $1", [reportId])).toHaveLength(1);
    expect(await rows(db.user(buyer), "select id from public.report_notes")).toHaveLength(0);
    expect(await errorOf(db.admin("update public.report_notes set body = 'changed'"))).toContain("APPEND_ONLY");

    expect(await errorOf(rows(service, "select public.admin_update_report($1, $2, '{\"status\":\"resolved\",\"summary\":\"done\"}')", [moderator, reportId]))).toContain("RESOLUTION_REQUIRED");
    await rows(service, "select public.admin_update_report($1, $2, $3)", [moderator, reportId, JSON.stringify({ status: "actioned", resolution_code: "warning_issued", summary: "We contacted the seller." })]);
    report = await one(service, "select status, priority, assigned_to from public.reports where id = $1", [reportId]);
    expect(report.status).toBe("actioned");
    const [mine] = await rows<{ status: string; resolution_summary: string }>(db.user(buyer), "select status, resolution_summary from public.my_report_cases()");
    expect(mine).toEqual({ status: "actioned", resolution_summary: "We contacted the seller." });
    expect(await errorOf(rows(service, "select public.admin_update_report($1, $2, '{\"status\":\"open\"}')", [moderator, reportId]))).toContain("REASON_REQUIRED");
  });
});

describe("reported-conversation investigation", () => {
  it("requires a documented, time-limited grant before any message is readable", async () => {
    expect(await errorOf(rows(service, "select * from public.admin_conversation_messages($1, $2)", [moderator, conversationId]))).toContain("ACCESS_GRANT_REQUIRED");
    expect(await errorOf(rows(service, "select * from public.admin_grant_conversation_access($1, $2, 'too short')", [moderator, conversationId]))).toContain("REASON_REQUIRED");
    expect(await errorOf(rows(service, "select * from public.admin_grant_conversation_access($1, $2, 'Investigating a scam report')", [support, conversationId]))).toContain("FORBIDDEN");
    await rows(service, "select * from public.admin_grant_conversation_access($1, $2, 'Investigating scam report on this listing', $3)", [moderator, conversationId, reportId]);
    const messages = await rows(service, "select * from public.admin_conversation_messages($1, $2)", [moderator, conversationId]);
    expect(messages).toHaveLength(2);
    expect(await auditCount("conversation.access_granted", moderator)).toBe(1);
    expect(await auditCount("conversation.messages_viewed", moderator)).toBe(1);
    // A grant is personal: another investigator still needs their own.
    expect(await errorOf(rows(service, "select * from public.admin_conversation_messages($1, $2)", [superAdmin, conversationId]))).toContain("ACCESS_GRANT_REQUIRED");
  });

  it("keeps participants from investigating their own conversations", async () => {
    const staffBuyer = await db.createUser({ email: "staffbuyer@example.edu.in", displayName: "Staff Buyer", role: "moderator" });
    const conv = await db.as(db.user(staffBuyer), async (q) => (await q.query<{ id: string }>("select public.start_conversation($1) as id", [listingId])).rows[0].id);
    expect(await errorOf(rows(service, "select * from public.admin_grant_conversation_access($1, $2, 'Looking at my own chat')", [staffBuyer, conv]))).toContain("CANNOT_TARGET_SELF");
  });

  it("stops new messages in a restricted conversation", async () => {
    await rows(service, "select public.admin_restrict_conversation($1, $2, true, 'Paused during investigation')", [moderator, conversationId]);
    expect(await errorOf(rows(db.user(buyer), "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hello?')", [conversationId, buyer]))).toContain("CONVERSATION_RESTRICTED");
    await rows(service, "select public.admin_restrict_conversation($1, $2, false, 'Investigation closed')", [moderator, conversationId]);
    await rows(db.user(buyer), "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hello again')", [conversationId, buyer]);
  });
});

describe("configuration guard rails", () => {
  it("protects categories that listings use", async () => {
    const category = await one<{ id: string; slug: string; name: string }>(service, "select id, slug, name from public.categories where slug = 'books-study-materials'");
    expect(await errorOf(rows(service, "select public.admin_delete_category($1, $2)", [superAdmin, category.id]))).toContain("CATEGORY_IN_USE");
    expect(await errorOf(rows(service, "select public.admin_save_category($1, $2, 'renamed-books', $3, null, 'book-open', false, true)", [superAdmin, category.id, category.name]))).toContain("CATEGORY_IN_USE");
    expect(await errorOf(rows(service, "select public.admin_save_category($1, $2, $3, 'Books', null, 'book-open', false, true)", [moderator, category.id, category.slug]))).toContain("FORBIDDEN");
    expect(await errorOf(rows(service, "select public.admin_reorder_categories($1, array[$2]::uuid[])", [superAdmin, category.id]))).toContain("INVALID_ORDER");
    const created = await one<{ id: string }>(service, "select public.admin_save_category($1, null, 'test-cat', 'Test category', 'Temporary', 'package', false, true) as id", [superAdmin]);
    await rows(service, "select public.admin_delete_category($1, $2)", [superAdmin, created.id]);
    expect(await auditCount("category.deleted", superAdmin)).toBe(1);
  });

  it("keeps at least one sign-up domain active", async () => {
    const domains = await db.admin<{ id: string }>("select id from public.university_domains where university_id = '00000000-0000-4000-8000-000000000001' and is_active order by domain");
    expect(domains).toHaveLength(2);
    await rows(service, "select public.admin_set_domain_active($1, $2, false, 'Retired subdomain')", [superAdmin, domains[1].id]);
    expect(await errorOf(rows(service, "select public.admin_set_domain_active($1, $2, false, 'Retire all')", [superAdmin, domains[0].id]))).toContain("LAST_ACTIVE_DOMAIN");
    await rows(service, "select public.admin_set_domain_active($1, $2, true, 'Restored for tests')", [superAdmin, domains[1].id]);
  });

  it("enforces the sign-up pause in the database", async () => {
    expect(await errorOf(rows(service, "select public.admin_set_setting($1, 'signups_paused', 'true', 'Spam wave')", [moderator]))).toContain("FORBIDDEN");
    expect(await errorOf(rows(service, "select public.admin_set_setting($1, 'admin_session_max_hours', '100', 'too long')", [superAdmin]))).toContain("INVALID_REQUEST");
    await rows(service, "select public.admin_set_setting($1, 'signups_paused', 'true', 'Spam wave')", [superAdmin]);
    expect(await errorOf(db.createUser({ email: "late@example.edu.in" }))).toContain("SIGNUPS_PAUSED");
    await rows(service, "select public.admin_set_setting($1, 'signups_paused', 'false', 'Spam wave over')", [superAdmin]);
    await db.createUser({ email: "late@example.edu.in" });
  });

  it("rate-limits exports per admin", async () => {
    for (let i = 0; i < 20; i++) await rows(service, "select public.admin_record_export($1, 'analytics_daily', 'analytics.export', 7)", [analyst]);
    expect(await errorOf(rows(service, "select public.admin_record_export($1, 'analytics_daily', 'analytics.export', 7)", [analyst]))).toContain("RATE_LIMITED:admin");
    expect(await errorOf(rows(service, "select public.admin_record_export($1, 'users', 'users.export', 7)", [moderator]))).toContain("FORBIDDEN");
  });
});

describe("admin list functions", () => {
  it("filters listings by admin state and returns totals", async () => {
    const quarantined = await db.publishListing(seller, { title: "Mystery pills", outcome: "limit" });
    const list = await rows<{ id: string; admin_state: string; total_count: number }>(db.user(moderator), "select id, admin_state, total_count from public.admin_list_listings(null, 'quarantined')");
    expect(list.map((l) => l.id)).toContain(quarantined.listing_id);
    expect(list.every((l) => l.admin_state === "quarantined")).toBe(true);
    expect(list[0].total_count).toBe(list.length);
  });

  it("searches reports by case number and assignee", async () => {
    const mine = await rows<{ id: string }>(db.user(moderator), "select id from public.admin_list_reports(null, 'all', null, null, null, null, 'me')");
    expect(mine.map((r) => r.id)).toEqual([reportId]);
    const [{ case_number }] = await db.admin<{ case_number: string }>("select case_number from public.reports where id = $1", [reportId]);
    expect(await rows(db.user(support), "select id from public.admin_list_reports($1, 'all')", [case_number])).toHaveLength(1);
  });
});
