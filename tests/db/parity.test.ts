import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@/features/moderation/policy";
import { SELLER_TRANSITIONS } from "@/features/listings/status";
import type { ListingStatus } from "@/features/listings/constants";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

describe("TypeScript mirrors match the database", () => {
  it("DEFAULT_POLICY equals policy version 1 from the migration", async () => {
    const [row] = await db.admin<{ config: unknown }>("select config from public.policy_versions where version = 1");
    expect(row.config).toEqual(DEFAULT_POLICY);
  });

  it("SELLER_TRANSITIONS equals listing_transition_allowed()", async () => {
    const statuses = Object.keys(SELLER_TRANSITIONS) as ListingStatus[];
    for (const from of statuses) {
      for (const to of statuses) {
        const [row] = await db.admin<{ ok: boolean }>("select public.listing_transition_allowed($1, $2) as ok", [from, to]);
        expect(row.ok, `${from} -> ${to}`).toBe(SELLER_TRANSITIONS[from].includes(to));
      }
    }
  });
});
