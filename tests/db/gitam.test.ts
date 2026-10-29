import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

describe("GITAM launch configuration (migration 0006)", () => {
  it("allows current students on @student.gitam.edu", async () => {
    const id = await db.createUser({ email: "a.student@student.gitam.edu", displayName: "Asha" });
    const [row] = await db.admin<{ name: string }>(
      "select u.name from public.profiles p join public.universities u on u.id = p.university_id where p.id = $1",
      [id],
    );
    expect(row.name).toBe("GITAM (Deemed to be University)");
  });

  it("rejects staff, look-alike and personal domains (no alumni for the pilot)", async () => {
    for (const email of ["prof@gitam.edu", "old.student@gitam.in", "fake@student.gitam.edu.in", "someone@gmail.com"]) {
      expect(await errorOf(db.createUser({ email })), email).toContain("EMAIL_DOMAIN_NOT_ALLOWED");
    }
  });

  it("matches the domain case-insensitively", async () => {
    const rows = await db.as({ kind: "anon" }, async (q) =>
      (await q.query<{ allowed: boolean; university_name: string }>("select * from public.check_email_domain($1)", ["Ravi.K@Student.GITAM.edu"])).rows,
    );
    expect(rows[0]).toEqual({ allowed: true, university_name: "GITAM (Deemed to be University)" });
  });
});
