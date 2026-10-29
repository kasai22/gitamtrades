import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

describe("anonymous visitors (landing and sign-up pages)", () => {
  it("can read active universities, domains and categories", async () => {
    const rows = await db.as({ kind: "anon" }, async (q) => ({
      universities: (await q.query<{ name: string }>("select name from public.universities")).rows,
      domains: (await q.query<{ domain: string }>("select domain from public.university_domains")).rows,
      categories: (await q.query<{ slug: string }>("select slug from public.categories")).rows,
    }));
    expect(rows.universities.map((u) => u.name)).toContain("GITAM (Deemed to be University)");
    expect(rows.domains.map((d) => d.domain)).toContain("student.gitam.edu");
    expect(rows.categories).toHaveLength(9);
  });

  it("only sees inactive configuration if staff (never as anon)", async () => {
    await db.admin("update public.categories set is_active = false where slug = 'other'");
    const slugs = await db.as({ kind: "anon" }, async (q) => (await q.query<{ slug: string }>("select slug from public.categories")).rows.map((r) => r.slug));
    expect(slugs).not.toContain("other");
    await db.admin("update public.categories set is_active = true where slug = 'other'");
  });

  it("still cannot read private tables", async () => {
    for (const table of ["profiles", "listings", "messages", "reports", "policy_versions", "forum_posts"]) {
      expect(await errorOf(db.as({ kind: "anon" }, (q) => q.query(`select * from public.${table} limit 1`))), table).toContain("permission denied");
    }
  });
});
