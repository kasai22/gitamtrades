import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

const attempt = (action: string, keys: string[], limits: number[], window = "1 hour") =>
  db.as(
    { kind: "service" },
    async (q) =>
      (await q.query<{ ok: boolean }>("select public.auth_attempt_allowed($1, $2, $3, $4::interval) as ok", [action, keys, limits, window]))
        .rows[0].ok,
  );

describe("auth_attempt_allowed (password reset limits)", () => {
  it("allows attempts up to the per-key limit, then refuses", async () => {
    for (let i = 0; i < 3; i++) expect(await attempt("test.limit", ["email-a"], [3])).toBe(true);
    expect(await attempt("test.limit", ["email-a"], [3])).toBe(false);
    // Another address and another action are counted separately.
    expect(await attempt("test.limit", ["email-b"], [3])).toBe(true);
    expect(await attempt("test.other", ["email-a"], [3])).toBe(true);
  });

  it("refuses when any key (e.g. the IP) is over its limit, without recording the others", async () => {
    expect(await attempt("test.ip", ["email-1", "ip-x"], [5, 2])).toBe(true);
    expect(await attempt("test.ip", ["email-2", "ip-x"], [5, 2])).toBe(true);
    expect(await attempt("test.ip", ["email-3", "ip-x"], [5, 2])).toBe(false);
    const [row] = await db.admin<{ n: number }>("select count(*)::int as n from public.auth_attempts where key_hash = 'email-3'");
    expect(row.n).toBe(0);
  });

  it("only counts attempts inside the window and clears rows older than a day", async () => {
    await db.admin("insert into public.auth_attempts (action, key_hash, created_at) values ('test.window', 'old', now() - interval '2 days')");
    expect(await attempt("test.window", ["old"], [1], "1 hour")).toBe(true);
    const [row] = await db.admin<{ n: number }>("select count(*)::int as n from public.auth_attempts where created_at < now() - interval '1 day'");
    expect(row.n).toBe(0);
  });

  it("can't be called, or the table read, by visitors or signed-in users", async () => {
    const userId = await db.createUser({ email: "someone@example.edu.in" });
    for (const actor of [{ kind: "anon" } as const, db.user(userId)]) {
      expect(await errorOf(db.as(actor, (q) => q.query("select public.auth_attempt_allowed('x', array['k'], array[1], '1 hour')")))).toContain(
        "permission denied",
      );
      expect(await errorOf(db.as(actor, (q) => q.query("select * from public.auth_attempts")))).toContain("permission denied");
    }
  });
});
