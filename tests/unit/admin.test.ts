import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/auth/session";

/**
 * Admin authorization in the application layer: permission resolution, session age, the API
 * wrapper (401/403/CSRF), list parameter allow-lists, CSV safety and navigation filtering.
 * Database enforcement of the same rules is covered by tests/db/admin.test.ts.
 */

const viewerMock = vi.hoisted(() => ({ current: null as Viewer | null }));
const deniedCalls = vi.hoisted(() => [] as unknown[]);

vi.mock("@/lib/auth/session", () => ({ getViewer: async () => viewerMock.current }));
vi.mock("@/features/admin/settings", () => ({
  getPlatformSettings: async () => ({ signupsPaused: false, listingPublishingPaused: false, communityPostingPaused: false, adminSessionMaxHours: 12, loaded: true }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: async (name: string, args: unknown) => (deniedCalls.push({ name, args }), { data: null, error: null }) }),
}));

const { permissionsFor, hasPermission, ROLE_PERMISSIONS, PERMISSIONS } = await import("@/lib/auth/permissions");
const { authorizeAdmin, isAdminSessionFresh, permissionFor } = await import("@/lib/auth/admin");
const { withAdmin, json } = await import("@/features/admin/api");
const { csvCell, toCsv } = await import("@/features/admin/lib/csv");
const { hrefWith, parseListParams, pickEnum, pickUuid } = await import("@/features/admin/lib/list-params");
const { parseDateRange } = await import("@/features/admin/lib/date-range");
const { navFor, isActiveNav } = await import("@/features/admin/components/shell/nav");
const { isProtectedPath, loginPathFor } = await import("@/lib/supabase/proxy");

function viewer(roles: string[], overrides: Partial<Viewer> = {}): Viewer {
  const isSuspended = overrides.isSuspended ?? false;
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    email: "staff@example.edu.in",
    displayName: "Staff",
    avatarPath: null,
    universityId: "u",
    universityName: "Example",
    memberSince: new Date().toISOString(),
    emailVerified: true,
    isVerified: !isSuspended,
    isSeller: false,
    canSell: false,
    canMessage: true,
    isSuspended,
    restrictions: [],
    roles: roles as Viewer["roles"],
    permissions: isSuspended ? [] : permissionsFor(roles),
    isStaff: !isSuspended && permissionsFor(roles).includes("overview.view"),
    isAdmin: !isSuspended && roles.includes("super_admin"),
    authenticatedAt: Date.now() - 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  viewerMock.current = null;
  deniedCalls.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("permission resolution", () => {
  it("unions role permissions and ignores unknown roles", () => {
    expect(permissionsFor(["analyst"])).toEqual(["overview.view", "analytics.view", "analytics.export", "config.view", "reports.export"].sort((a, b) => PERMISSIONS.indexOf(a as never) - PERMISSIONS.indexOf(b as never)));
    expect(permissionsFor(["moderator", "support_admin"])).toContain("users.view_contact");
    expect(permissionsFor(["admin", "student"])).toEqual([]);
    expect(permissionsFor(["super_admin"])).toEqual([...PERMISSIONS]);
  });

  it("keeps sensitive permissions with the intended roles only", () => {
    const holders = (p: (typeof PERMISSIONS)[number]) => Object.entries(ROLE_PERMISSIONS).filter(([, ps]) => ps.includes(p)).map(([r]) => r).sort();
    expect(holders("roles.manage")).toEqual(["super_admin"]);
    expect(holders("messages.investigate")).toEqual(["moderator", "super_admin"]);
    expect(holders("users.view_contact")).toEqual(["super_admin", "support_admin"]);
    expect(holders("audit.view")).toEqual(["super_admin"]);
    expect(holders("listings.moderate")).toEqual(["moderator", "super_admin"]);
  });

  it("maps resources and actions to permissions", () => {
    expect(permissionFor("listing", "moderate")).toBe("listings.moderate");
    expect(permissionFor("conversation", "investigate")).toBe("messages.investigate");
  });
});

describe("admin session age", () => {
  it("requires a recent interactive sign-in", () => {
    const now = Date.UTC(2026, 9, 29, 12);
    expect(isAdminSessionFresh(now - 3_600_000, 12, now)).toBe(true);
    expect(isAdminSessionFresh(now - 13 * 3_600_000, 12, now)).toBe(false);
    expect(isAdminSessionFresh(null, 12, now)).toBe(false);
    expect(isAdminSessionFresh(now + 10 * 60_000, 12, now)).toBe(false);
  });
});

describe("authorizeAdmin (Server Actions and API)", () => {
  it("rejects signed-out users, students and stale sessions", async () => {
    expect(await authorizeAdmin("overview.view", "x")).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    viewerMock.current = viewer([]);
    expect(await authorizeAdmin("overview.view", "x")).toMatchObject({ error: { code: "FORBIDDEN" } });
    viewerMock.current = viewer(["moderator"], { authenticatedAt: Date.now() - 24 * 3_600_000 });
    expect(await authorizeAdmin("overview.view", "x")).toMatchObject({ error: { code: "SESSION_EXPIRED" } });
  });

  it("denies permissions outside the role and records the attempt", async () => {
    viewerMock.current = viewer(["moderator"]);
    expect(await authorizeAdmin("roles.manage", "role.granted")).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(deniedCalls).toEqual([{ name: "admin_record_denied", args: expect.objectContaining({ p_action: "role.granted", p_permission: "roles.manage" }) }]);
    expect(await authorizeAdmin("listings.moderate", "listing.remove")).toHaveProperty("actor");
  });

  it("treats a suspended staff account as having no permissions", async () => {
    viewerMock.current = viewer(["super_admin"], { isSuspended: true });
    expect(await authorizeAdmin("overview.view", "x")).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("can't be escalated by client-controlled fields", async () => {
    // Only `roles` (read from user_roles on the server) feeds permissions; a forged `isAdmin` flag is ignored.
    viewerMock.current = { ...viewer([]), isAdmin: true, isStaff: true };
    expect(await authorizeAdmin("roles.manage", "x")).toMatchObject({ error: { code: "FORBIDDEN" } });
  });
});

describe("withAdmin API wrapper", () => {
  const handler = withAdmin("users.view", "users.list", async (_req, _ctx, actor) => json({ actor: actor.id }));
  const request = (method: string, headers: Record<string, string> = {}) => new NextRequest("https://app.example/api/admin/users", { method, headers });

  it("returns 401 without a session and 403 for students", async () => {
    expect((await handler(request("GET"), {})).status).toBe(401);
    viewerMock.current = viewer([]);
    expect((await handler(request("GET"), {})).status).toBe(403);
  });

  it("returns 403 for staff without the permission and 200 with it", async () => {
    viewerMock.current = viewer(["analyst"]);
    const denied = await handler(request("GET"), {});
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: { code: "FORBIDDEN", message: expect.any(String) } });
    viewerMock.current = viewer(["support_admin"]);
    const allowed = await handler(request("GET"), {});
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects cross-site or non-JSON mutations before authorizing", async () => {
    viewerMock.current = viewer(["super_admin"]);
    const post = withAdmin("users.restrict", "x", async () => json({}));
    const crossSite = await post(request("POST", { origin: "https://evil.example", "content-type": "application/json" }), {});
    expect(crossSite.status).toBe(403);
    expect((await crossSite.json()).error.code).toBe("CSRF_REJECTED");
    expect((await post(request("POST", { origin: "https://app.example", "content-type": "text/plain" }), {})).status).toBe(403);
    expect((await post(request("POST", { "content-type": "application/json" }), {})).status).toBe(403);
    expect((await post(request("POST", { origin: "https://app.example", "content-type": "application/json" }), {})).status).toBe(200);
  });
});

describe("list parameters", () => {
  it("only accepts allow-listed sorts, filters and page sizes", () => {
    const params = parseListParams({ sort: "password", dir: "sideways", page: "-3", pageSize: "5000", q: "  desk  " }, { sorts: ["created_at", "price"] as const, defaultSort: "created_at" });
    expect(params).toEqual({ page: 1, pageSize: 25, sort: "created_at", dir: "desc", q: "desk", offset: 0 });
    expect(parseListParams({ sort: "price", dir: "asc", page: "3", pageSize: "50" }, { sorts: ["created_at", "price"] as const, defaultSort: "created_at" })).toMatchObject({ sort: "price", dir: "asc", offset: 100 });
    expect(pickEnum({ state: "admin'--" }, "state", ["live", "sold"] as const, "live")).toBe("live");
    expect(pickUuid({ id: "not-a-uuid" }, "id")).toBeUndefined();
  });

  it("builds stable URLs and resets the page when filters change", () => {
    expect(hrefWith("/admin/users", { q: "a b", status: undefined, page: 3 }, { status: "verified" })).toBe("/admin/users?q=a+b&status=verified");
    expect(hrefWith("/admin/users", {}, { page: 1 })).toBe("/admin/users");
  });
});

describe("CSV exports", () => {
  it("neutralises spreadsheet formulas and quotes special characters", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("a,b")).toBe("\"a,b\"");
    expect(toCsv([{ a: 1 }], [{ header: "a", value: (r) => r.a }])).toBe("﻿a\r\n1\r\n");
  });
});

describe("date ranges", () => {
  it("defaults to presets and clamps custom ranges", () => {
    const now = new Date("2026-10-29T06:00:00Z");
    expect(parseDateRange({}, now)).toMatchObject({ from: "2026-09-30", to: "2026-10-29", preset: "30d", days: 30 });
    expect(parseDateRange({ range: "7d" }, now)).toMatchObject({ from: "2026-10-23", to: "2026-10-29" });
    expect(parseDateRange({ from: "2020-01-01", to: "2030-01-01" }, now)).toMatchObject({ to: "2026-10-29", days: 366 });
    expect(parseDateRange({ from: "nope", to: "2026-10-01" }, now).preset).toBe("30d");
  });
});

describe("console navigation and routing", () => {
  it("shows each role only the sections it can open", () => {
    const hrefs = (roles: string[]) => navFor(permissionsFor(roles)).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs(["analyst"])).toEqual(["/admin", "/admin/analytics", "/admin/categories", "/admin/universities", "/admin/settings"]);
    expect(hrefs(["support_admin"])).not.toContain("/admin/messages");
    expect(hrefs(["moderator"])).toContain("/admin/messages");
    expect(hrefs(["moderator"])).not.toContain("/admin/roles");
    expect(hasPermission({ permissions: permissionsFor(["super_admin"]) }, "roles.manage")).toBe(true);
    expect(isActiveNav("/admin/users/123", "/admin/users")).toBe(true);
    expect(isActiveNav("/admin/users", "/admin")).toBe(false);
  });

  it("sends signed-out admin visitors to the admin sign-in, and keeps it public", () => {
    expect(isProtectedPath("/admin/reports")).toBe(true);
    expect(isProtectedPath("/admin/login")).toBe(false);
    expect(loginPathFor("/admin/reports")).toBe("/admin/login");
    expect(loginPathFor("/admin")).toBe("/admin/login");
    expect(loginPathFor("/administrator")).toBe("/login");
    expect(loginPathFor("/sell")).toBe("/login");
  });
});
