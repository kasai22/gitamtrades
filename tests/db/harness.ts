import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const root = path.resolve(__dirname, "..", "..");
const migrationsDir = path.join(root, "supabase", "migrations");

export const UNIVERSITY_ID = "00000000-0000-4000-8000-000000000001";

type Queryable = Pick<Transaction, "query" | "exec">;
export type Actor = { kind: "user"; id: string } | { kind: "anon" } | { kind: "service" };

/**
 * A fresh PGlite database with Supabase stubs, every migration, the seed and the test fixtures applied.
 * Each test file should create its own instance (they are cheap and fully isolated).
 */
export async function createTestDb() {
  const db = await PGlite.create();
  await db.exec(readFileSync(path.join(__dirname, "supabase-stubs.sql"), "utf8"));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  await db.exec(readFileSync(path.join(root, "supabase", "seed.sql"), "utf8"));
  await db.exec(readFileSync(path.join(__dirname, "fixtures.sql"), "utf8"));
  return new TestDb(db);
}

export class TestDb {
  constructor(readonly pg: PGlite) {}

  /** Runs `fn` as the given actor inside a transaction that is always rolled back afterwards
   * unless `commit` is true. Role and JWT claims are scoped to the transaction. */
  async as<T>(actor: Actor, fn: (q: Queryable) => Promise<T>, { commit = true } = {}): Promise<T> {
    return this.pg.transaction(async (tx) => {
      if (actor.kind === "user") {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: actor.id, role: "authenticated" }),
        ]);
        await tx.exec("set local role authenticated");
      } else if (actor.kind === "anon") {
        await tx.exec("set local role anon");
      } else {
        await tx.exec("set local role service_role");
      }
      const result = await fn(tx);
      if (!commit) await tx.rollback();
      return result;
    });
  }

  user(id: string): Actor {
    return { kind: "user", id };
  }

  /** Superuser query (bypasses RLS) for arranging test state. */
  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  async createUser(opts: {
    email: string;
    verified?: boolean;
    displayName?: string;
    seller?: boolean;
    role?: "super_admin" | "moderator" | "support_admin" | "analyst";
  }) {
    const [row] = await this.admin<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, $3) returning id`,
      [
        opts.email,
        opts.verified === false ? null : new Date().toISOString(),
        JSON.stringify({ display_name: opts.displayName ?? "Test Student", age_confirmed: true, terms_version: "2026-10-28" }),
      ],
    );
    if (opts.seller) {
      await this.admin("update public.profiles set seller_enabled_at = now() where id = $1", [row.id]);
    }
    if (opts.role) {
      await this.admin("insert into public.user_roles (user_id, role) values ($1, $2)", [row.id, opts.role]);
    }
    return row.id;
  }

  async categoryId(slug: string) {
    const [row] = await this.admin<{ id: string }>("select id from public.categories where slug = $1", [slug]);
    return row.id;
  }

  /** Publishes a listing through persist_listing exactly as the server does. */
  async publishListing(
    sellerId: string,
    opts: {
      title?: string;
      categorySlug?: string;
      price?: number;
      outcome?: "allow" | "limit" | "block";
      intent?: "publish" | "draft";
      listingId?: string | null;
      clientRequestId?: string;
      imageIds?: string[];
      ticketConfirmed?: boolean;
    } = {},
  ) {
    const categoryId = await this.categoryId(opts.categorySlug ?? "books-study-materials");
    const result = await this.as({ kind: "service" }, async (q) => {
      const res = await q.query<{ persist_listing: { listing_id: string; status: string; moderation_status: string; duplicate_request: boolean } }>(
        "select public.persist_listing($1, $2, $3, $4, $5, $6)",
        [
          sellerId,
          opts.listingId ?? null,
          JSON.stringify({
            category_id: categoryId,
            title: opts.title ?? "Engineering Mathematics textbook",
            description: "Lightly used, no markings.",
            price_inr: opts.price ?? 250,
            condition: "good",
            client_request_id: opts.clientRequestId ?? null,
            ticket_transfer_confirmed: opts.ticketConfirmed ?? false,
          }),
          JSON.stringify({
            intent: opts.intent ?? "publish",
            outcome: opts.intent === "draft" ? null : (opts.outcome ?? "allow"),
            reasons: opts.outcome && opts.outcome !== "allow" ? [{ code: "test_reason", severity: opts.outcome, message: "Test" }] : [],
            rule_version: "p1/e-test",
            policy_version: "1",
          }),
          opts.imageIds ?? [],
          JSON.stringify({ owns_item: true, complies_with_policy: true, ticket_transferable: opts.ticketConfirmed ?? false }),
        ],
      );
      return res.rows[0].persist_listing;
    });
    return result;
  }
}

/** Extracts the Postgres error message so assertions can match our stable error codes. */
export async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected the operation to fail, but it succeeded");
}
