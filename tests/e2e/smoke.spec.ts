import { expect, test } from "@playwright/test";

/** Runs without a backend. Verifies public surfaces, accessibility basics and responsive layout. */

test("landing page explains the student-only marketplace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("campus");
  await expect(page.getByRole("link", { name: /Join with university email|Browse listings/ }).first()).toBeVisible();
  // AC-08 / §9.3: offline settlement is explained, no payment is implied.
  await expect(page.getByText(/Payment happens in person/)).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Grievance redressal" })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByText(/not owned, operated or endorsed by GITAM/)).toBeVisible();
});

test("skip link moves keyboard focus to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

for (const path of ["/policies/prohibited-items", "/safety", "/help", "/terms", "/privacy", "/grievance"]) {
  test(`policy page ${path} renders with a single h1`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
}

test("prohibited items policy lists ticket rules (SAFE-05)", async ({ page }) => {
  await page.goto("/policies/prohibited-items");
  await expect(page.getByRole("heading", { name: "Event tickets" })).toBeVisible();
  await expect(page.getByText(/Never show QR codes/)).toBeVisible();
});

test("protected pages require sign-in", async ({ page }) => {
  for (const path of ["/marketplace", "/sell", "/messages", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login|\/$/);
  }
});

test("pages fit a 360px viewport without horizontal scrolling (AC-14)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/", "/login", "/signup", "/policies/prohibited-items", "/help"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test("security headers are set", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("sign-out only accepts POST", async ({ request }) => {
  const response = await request.get("/auth/signout", { maxRedirects: 0 });
  expect(response.status()).toBe(405);
});

test.describe("admin console boundary (signed out)", () => {
  test("console pages redirect to the admin sign-in, keeping the destination", async ({ page }) => {
    for (const path of ["/admin", "/admin/users", "/admin/reports", "/admin/roles", "/admin/audit-logs"]) {
      await page.goto(path);
      await expect(page).toHaveURL((url) => url.pathname === "/admin/login" && url.searchParams.get("next") === path);
    }
  });

  test("the admin sign-in page renders without console chrome", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("admin");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  });

  test("renamed admin routes redirect", async ({ request }) => {
    const audit = await request.get("/admin/audit", { maxRedirects: 0 });
    expect(audit.headers().location).toContain("/admin/audit-logs");
    const policy = await request.get("/admin/policy", { maxRedirects: 0 });
    expect(policy.headers().location).toContain("/admin/moderation");
  });

  test("admin APIs return 401 without a session and are never cached", async ({ request }) => {
    for (const path of ["/api/admin/overview", "/api/admin/users", "/api/admin/reports?format=csv", "/api/admin/audit-logs", "/api/admin/messages?q=R-000001"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("admin API mutations reject cross-site requests before authorizing", async ({ request }) => {
    const response = await request.post("/api/admin/listings", {
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      data: { action: "remove", listingIds: ["00000000-0000-4000-8000-000000000001"], reason: "test", confirm: true },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe("CSRF_REJECTED");
  });
});
