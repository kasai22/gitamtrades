import { describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

describe("migrations", () => {
  it("apply cleanly with seed data", async () => {
    const db = await createTestDb();
    const cats = await db.admin<{ count: number }>("select count(*)::int as count from public.categories");
    expect(cats[0].count).toBe(9);
    const policy = await db.admin<{ version: number }>("select version from public.policy_versions where is_active");
    expect(policy[0].version).toBe(1);
  });
});
