import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/**
 * MVP journeys (build brief §12). Requires a disposable Supabase stack with migrations + seed applied:
 *   npx supabase start && npx supabase db reset
 *   E2E_SUPABASE=1 npm run test:e2e
 * Uses the service key only to arrange fixtures (confirmed users, admin role). Never run against production.
 */
const enabled = process.env.E2E_SUPABASE === "1";
test.skip(!enabled, "Set E2E_SUPABASE=1 with a local Supabase stack to run the journey suite.");
test.describe.configure({ mode: "serial" });

const DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? "student.gitam.edu";
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const PASSWORD = "Campus-test-2026";
const run = Date.now().toString(36);
const email = (name: string) => `${name}.${run}@${DOMAIN}`;

const admin = enabled
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
      auth: { persistSession: false },
    })
  : null;

async function createStudent(name: string, opts: { seller?: boolean; role?: "super_admin" | "moderator" | "support_admin" | "analyst" } = {}) {
  const { data, error } = await admin!.auth.admin.createUser({
    email: email(name),
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name, age_confirmed: true, terms_version: "e2e" },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  if (opts.seller) await admin!.from("profiles").update({ seller_enabled_at: new Date().toISOString() }).eq("id", data.user.id);
  if (opts.role) await admin!.from("user_roles").insert({ user_id: data.user.id, role: opts.role });
  return { id: data.user.id, email: email(name) };
}

async function signIn(page: Page, address: string) {
  await page.goto("/login");
  await page.getByLabel("University email").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/marketplace/);
}

async function signOut(page: Page) {
  await page.context().clearCookies();
}

let seller: { id: string; email: string };
let buyer: { id: string; email: string };
let outsider: { id: string; email: string };
let moderator: { id: string; email: string };
let listingUrl = "";
let conversationUrl = "";
const title = `Casio fx-991EX calculator ${run}`;

test.beforeAll(async () => {
  seller = await createStudent("seller");
  buyer = await createStudent("buyer");
  outsider = await createStudent("outsider");
  moderator = await createStudent("moderator", { role: "super_admin" });
});

test("1–2. an eligible student signs up, verifies their email and signs in", async ({ page, request }) => {
  const address = email("newcomer");
  await page.goto("/signup");
  await page.getByLabel("Name shown to other students").fill("Newcomer");
  await page.getByLabel("University email").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByText("I am 18 or older.").click();
  await page.getByText(/I agree to the/).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);

  // Follow the confirmation link from the local mail catcher.
  let link: string | undefined;
  for (let attempt = 0; attempt < 20 && !link; attempt++) {
    const list = await (await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(address)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const message = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      link = String(message.HTML ?? message.Text).match(/https?:\/\/[^\s"'<>]+(verify|confirm|callback)[^\s"'<>]*/)?.[0]?.replace(/&amp;/g, "&");
    }
    if (!link) await page.waitForTimeout(500);
  }
  expect(link, "verification email").toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/marketplace/);
  await expect(page.getByRole("heading", { name: /Browse listings/ })).toBeVisible();
});

test("rejects a generic email domain with a clear reason (AUTH-01)", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name shown to other students").fill("Nope");
  await page.getByLabel("University email").fill(`nope.${run}@gmail.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByText("I am 18 or older.").click();
  await page.getByText(/I agree to the/).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/approved university domain/)).toBeVisible();
});

test("3. a student enables selling and publishes a permitted listing without manual approval", async ({ page }) => {
  await signIn(page, seller.email);
  await page.goto("/sell");
  await page.getByText(/I.ll follow these seller rules/).click();
  await page.getByRole("button", { name: "Start selling" }).click();
  await expect(page.getByLabel("Title")).toBeVisible();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption({ label: "Electronics" });
  await page.getByLabel("Asking price (₹)").fill("650");
  await page.getByText("Good", { exact: true }).click();
  await page.getByLabel("Description").fill("Works perfectly, includes cover.");
  await page.getByText("I own this item or am allowed to sell it.").click();
  await page.getByText(/It.s legal to sell and follows the/).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}\?published=1/);
  await expect(page.getByText("Your listing is live")).toBeVisible();
  listingUrl = page.url().split("?")[0];
});

test("a prohibited listing is blocked with an explanation (AC-04)", async ({ page }) => {
  await signIn(page, seller.email);
  await page.goto("/sell");
  await page.getByLabel("Title").fill(`Desi katta for sale ${run}`);
  await page.getByLabel("Category").selectOption({ label: "Other permitted items" });
  await page.getByLabel("Asking price (₹)").fill("5000");
  await page.getByText("Good", { exact: true }).click();
  await page.getByText("I own this item or am allowed to sell it.").click();
  await page.getByText(/It.s legal to sell and follows the/).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("This listing wasn't published")).toBeVisible();
  await expect(page.getByText(/Weapons, ammunition and explosives/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a review" })).toBeVisible();
});

test("4–6. another student finds it via search and starts a conversation; both see it", async ({ page, browser }) => {
  await signIn(page, buyer.email);
  await page.goto(`/search?q=${encodeURIComponent("calculator " + run)}`);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Chat with seller" }).click();
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/);
  conversationUrl = page.url();
  await page.getByLabel("Message").fill("Hi! Is this still available?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Hi! Is this still available?")).toBeVisible();
  await expect(page.getByText("Sent")).toBeVisible();

  const sellerContext = await browser.newContext();
  const sellerPage = await sellerContext.newPage();
  await signIn(sellerPage, seller.email);
  await sellerPage.goto(conversationUrl);
  await expect(sellerPage.getByText("Hi! Is this still available?")).toBeVisible();
  await expect(sellerPage.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await sellerContext.close();
});

test("7. an unrelated student cannot access that conversation", async ({ page }) => {
  await signIn(page, outsider.email);
  const response = await page.goto(conversationUrl);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Hi! Is this still available?")).toHaveCount(0);
});

test("8. a user can report a suspicious listing and gets a case number", async ({ page }) => {
  await signIn(page, outsider.email);
  await page.goto(listingUrl);
  await page.getByRole("button", { name: "Report" }).first().click();
  await page.getByText("Suspected scam").click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText(/Your case number is R-\d{6}/)).toBeVisible();
});

test("9. an administrator reviews the report and takes action", async ({ page }) => {
  await signIn(page, moderator.email);
  await page.goto("/admin/reports");
  await page.getByRole("link", { name: /^R-\d{6}$/ }).first().click();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await page.getByLabel("Summary for the reporter").fill("Checked with the seller; the listing is genuine.");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Report updated.")).toBeVisible();
  await page.goto("/admin/audit");
  await expect(page.getByText("report.dismissed").first()).toBeVisible();
});

test("10. the seller marks the listing sold and it leaves discovery", async ({ page }) => {
  await signIn(page, seller.email);
  await page.goto(listingUrl);
  await page.getByRole("button", { name: "Mark as sold" }).click();
  await expect(page.getByText("Marked as sold")).toBeVisible();
  await signOut(page);
  await signIn(page, buyer.email);
  await page.goto(`/search?q=${encodeURIComponent("calculator " + run)}`);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
  await page.goto(listingUrl);
  await expect(page.getByText(/This item has been sold/)).toBeVisible();
});

test("11. another student cannot edit the seller's listing", async ({ page }) => {
  await signIn(page, buyer.email);
  const response = await page.goto(`${listingUrl.replace("/listings/", "/sell/")}/edit`);
  expect(response?.status()).toBe(404);
});

test("12. an unverified user cannot use protected marketplace features", async ({ page }) => {
  const { data } = await admin!.auth.admin.createUser({
    email: email("unverified"),
    password: PASSWORD,
    email_confirm: false,
    user_metadata: { display_name: "Unverified", age_confirmed: true, terms_version: "e2e" },
  });
  expect(data.user).toBeTruthy();
  await page.goto("/login");
  await page.getByLabel("University email").fill(email("unverified"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await page.goto("/sell");
  await expect(page).toHaveURL(/\/login|\/verify-email/);
});
