import { describe, expect, it } from "vitest";
import { listingFormSchema } from "@/features/listings/schemas";
import { canTransition, effectiveStatus, isContactable, sellerActions } from "@/features/listings/status";
import { activeFilterChips, parseSearchParams, toQueryString } from "@/features/search/params";
import { CONDITION_LABELS } from "@/features/listings/constants";
import { errorCode, friendlyError } from "@/lib/errors";
import { formatPrice } from "@/lib/format";
import { safeNextPath } from "@/lib/security/safe-redirect";

const validListing = {
  title: "Engineering Drawing kit",
  categoryId: "3f1c2b8e-1d2a-4c3b-9e8f-1a2b3c4d5e6f",
  priceInr: "350",
  condition: "good",
  description: "Mini drafter and set squares.",
  meetupAreaId: "",
  ticketEventName: "",
  ticketEventDate: "",
  ticketTransferConfirmed: false,
  imageIds: [],
  declarationOwnsItem: true,
  declarationCompliesWithPolicy: true,
  clientRequestId: "7d9b5b0e-7f6c-4f1e-8b2d-4b8f6f1a2c3d",
  intent: "publish",
};

describe("listing form schema (AC-03)", () => {
  it("accepts a valid listing and coerces the price", () => {
    const parsed = listingFormSchema.parse(validListing);
    expect(parsed.priceInr).toBe(350);
  });

  it("supports free items", () => {
    expect(listingFormSchema.parse({ ...validListing, priceInr: "0" }).priceInr).toBe(0);
  });

  it("returns field-level messages for invalid input", () => {
    const result = listingFormSchema.safeParse({ ...validListing, title: "!!", priceInr: "-5", categoryId: "" });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["title", "priceInr", "categoryId"]));
  });

  it("requires the seller declaration to publish but not to save a draft", () => {
    const publish = listingFormSchema.safeParse({ ...validListing, declarationOwnsItem: false });
    expect(publish.success).toBe(false);
    const draft = listingFormSchema.safeParse({ ...validListing, declarationOwnsItem: false, intent: "draft" });
    expect(draft.success).toBe(true);
  });
});

describe("listing status machine (LIST-05, §8.3)", () => {
  it("allows only PRD transitions", () => {
    expect(canTransition("active", "sold")).toBe(true);
    expect(canTransition("sold", "active")).toBe(true);
    expect(canTransition("sold", "on_hold")).toBe(false);
    expect(canTransition("removed", "active")).toBe(false);
    expect(canTransition("draft", "active")).toBe(false); // only via publish + checks
  });

  it("treats past-expiry listings as expired", () => {
    const now = new Date("2026-10-28T00:00:00Z");
    expect(effectiveStatus("active", "2026-10-27T00:00:00Z", now)).toBe("expired");
    expect(effectiveStatus("active", "2026-11-27T00:00:00Z", now)).toBe("active");
    expect(effectiveStatus("sold", "2026-10-01T00:00:00Z", now)).toBe("sold");
  });

  it("only offers reactivation when the listing is not under review", () => {
    const actions = sellerActions({ status: "on_hold", moderation_status: "limited", expires_at: null });
    expect(actions.map((a) => a.to)).toEqual(["sold", "removed"]);
    expect(sellerActions({ status: "expired", moderation_status: "clear", expires_at: null })[0].label).toBe("Renew listing");
  });

  it("is contactable only when active, clear and unexpired (DISC-04)", () => {
    expect(isContactable({ status: "active", moderation_status: "clear", expires_at: null })).toBe(true);
    expect(isContactable({ status: "sold", moderation_status: "clear", expires_at: null })).toBe(false);
    expect(isContactable({ status: "on_hold", moderation_status: "clear", expires_at: null })).toBe(false);
    expect(isContactable({ status: "active", moderation_status: "limited", expires_at: null })).toBe(false);
  });
});

describe("search params (DISC-02, DISC-03)", () => {
  it("parses and sanitises untrusted params", () => {
    const filters = parseSearchParams({
      q: "  calculator  ",
      category: "electronics",
      min: "₹1,000",
      max: "200",
      condition: ["good,fair", "bogus"],
      sort: "nope",
      page: "-3",
    });
    expect(filters).toMatchObject({
      q: "calculator",
      category: "electronics",
      minPrice: 200,
      maxPrice: 1000,
      conditions: ["good", "fair"],
      sort: "relevance",
      page: 1,
    });
  });

  it("rejects suspicious category slugs and caps prices", () => {
    expect(parseSearchParams({ category: "../etc" }).category).toBeNull();
    expect(parseSearchParams({ max: "999999999" }).maxPrice).toBe(1_000_000);
  });

  it("round-trips filters into shareable URLs", () => {
    const filters = parseSearchParams({ q: "lamp", condition: "good", free: "1", page: "2" });
    expect(toQueryString(filters)).toBe("?q=lamp&free=1&condition=good&page=2");
    expect(parseSearchParams(Object.fromEntries(new URLSearchParams(toQueryString(filters))))).toEqual(filters);
  });

  it("builds removable chips that reset pagination", () => {
    const filters = parseSearchParams({ q: "lamp", condition: "good", page: "3" });
    const chips = activeFilterChips(filters, "/search", { conditions: CONDITION_LABELS });
    expect(chips.map((c) => c.label)).toEqual(["“lamp”", "Good"]);
    expect(chips[1].removeHref).toBe("/search?q=lamp");
  });
});

describe("helpers", () => {
  it("renders ₹0 as Free (LIST-02)", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(1500)).toBe("₹1,500");
  });

  it("maps database error codes to friendly copy without leaking internals", () => {
    expect(errorCode({ message: 'ERROR: RATE_LIMITED:messages' })).toBe("RATE_LIMITED:messages");
    expect(friendlyError({ message: "EMAIL_DOMAIN_NOT_ALLOWED" })).toMatch(/university email/);
    expect(friendlyError({ message: "relation secret_table does not exist" })).toBe("Something went wrong. Please try again.");
  });

  it("blocks open redirects", () => {
    expect(safeNextPath("/messages/abc?x=1")).toBe("/messages/abc?x=1");
    expect(safeNextPath("https://evil.example")).toBe("/marketplace");
    expect(safeNextPath("//evil.example")).toBe("/marketplace");
    expect(safeNextPath("/\\evil.example")).toBe("/marketplace");
    expect(safeNextPath(null)).toBe("/marketplace");
  });
});
