import { describe, expect, it } from "vitest";
import { evaluateListing, normalizeText, type ListingCandidate, type ModerationContext } from "@/features/moderation/engine";
import { DEFAULT_POLICY, parsePolicy, policySchema } from "@/features/moderation/policy";

const base: ListingCandidate = {
  title: "Casio fx-991EX scientific calculator",
  description: "Used for two semesters, works perfectly. Includes cover.",
  categorySlug: "electronics",
  categoryIsTicket: false,
  ticketTransferConfirmed: false,
  images: [],
};
const ctx: ModerationContext = { policy: DEFAULT_POLICY, policyVersion: 1 };
const evaluate = (patch: Partial<ListingCandidate>, context: Partial<ModerationContext> = {}) =>
  evaluateListing({ ...base, ...patch }, { ...ctx, ...context });
const codes = (patch: Partial<ListingCandidate>, context: Partial<ModerationContext> = {}) =>
  evaluate(patch, context).reasons.map((r) => r.code);

describe("normalizeText", () => {
  it("undoes leetspeak, repeated letters, accents and spaced-out spelling", () => {
    expect(normalizeText("G4NJ4 available")).toBe("ganja available");
    expect(normalizeText("gaaaanja")).toBe("ganja");
    expect(normalizeText("g a n j a")).toBe("ganja");
    expect(normalizeText("Café—Crème!")).toBe("cafe creme");
    expect(normalizeText("Price 500 only")).toBe("price 500 only");
  });
});

describe("evaluateListing", () => {
  it("allows ordinary listings with no reasons (publish immediately)", () => {
    const decision = evaluate({});
    expect(decision.outcome).toBe("allow");
    expect(decision.reasons).toEqual([]);
    expect(decision.ruleVersion).toBe("p1/e1.0.0");
  });

  it("allows near-miss everyday items", () => {
    for (const title of [
      "Forged steel dumbbells 10kg",
      "Bullet journal with stickers",
      "Printer cartridges HP 680",
      "Brown sugar jar and kitchen set",
      "Samsung Galaxy Tab A tablet",
      "Methods of Mathematical Physics textbook",
      "Seaweed snack box",
    ]) {
      expect(evaluate({ title, description: "" }).outcome, title).toBe("allow");
    }
  });

  it("blocks high-confidence prohibited items with a specific reason and matched term", () => {
    const decision = evaluate({ title: "Good quality ganja", description: "" });
    expect(decision.outcome).toBe("block");
    expect(decision.reasons[0]).toMatchObject({ code: "prohibited_drugs", severity: "block", field: "title", match: "ganja" });
    expect(decision.reasons[0].message).toMatch(/aren't allowed/);
  });

  it("catches obfuscated prohibited terms", () => {
    expect(codes({ title: "c0caine" })).toContain("prohibited_drugs");
    expect(codes({ description: "selling a d e s i k a t t a" })).toContain("prohibited_weapons");
    expect(codes({ title: "Rolex first-copy watch" })).toContain("counterfeit");
    expect(codes({ title: "E-cigarette with pods" })).toContain("regulated_goods");
  });

  it("limits ambiguous items for review instead of blocking", () => {
    const decision = evaluate({ title: "Kitchen knife set" });
    expect(decision.outcome).toBe("limit");
    expect(decision.reasons[0].code).toBe("needs_review_term");
  });

  it("blocks contact details, payment ids and ID numbers in public text", () => {
    expect(codes({ description: "Call me on 98765 43210" })).toContain("contact_details_in_listing");
    expect(codes({ description: "call +91-9876543210" })).toContain("contact_details_in_listing");
    expect(codes({ description: "mail me at abc@gmail.com" })).toContain("contact_details_in_listing");
    expect(codes({ description: "whatsapp wa.me/919876543210" })).toContain("contact_details_in_listing");
    expect(codes({ description: "GPay to rahul@okaxis" })).toContain("payment_details_in_listing");
    expect(codes({ description: "Aadhaar 1234 5678 9012 attached" })).toContain("sensitive_personal_data");
    expect(codes({ description: "PAN ABCDE1234F" })).toContain("sensitive_personal_data");
  });

  it("does not mistake ISBNs, model numbers or prices for phone numbers", () => {
    expect(evaluate({ description: "ISBN 9780131103627, model 2023, price 6500" }).outcome).toBe("allow");
  });

  it("limits links and scam phrasing for review", () => {
    expect(evaluate({ description: "Specs at https://example.com/specs" }).reasons.map((r) => r.code)).toEqual(["external_link"]);
    expect(evaluate({ description: "bit.ly/abc" }).outcome).toBe("limit");
    const scam = evaluate({ description: "Pay token amount to reserve" });
    expect(scam.outcome).toBe("limit");
    expect(scam.reasons[0].code).toBe("possible_scam_language");
  });

  it("applies event-ticket guardrails", () => {
    const ticket = { categorySlug: "event-tickets", categoryIsTicket: true, title: "Sunburn2026 pass", description: "Day 1 pass" };
    expect(codes(ticket)).toEqual(["ticket_transfer_unconfirmed"]);
    expect(evaluate({ ...ticket, ticketTransferConfirmed: true }).outcome).toBe("allow");
    expect(codes({ ...ticket, ticketTransferConfirmed: true, description: "Booking ID: 8F3K29XQ" })).toContain("ticket_code_exposed");
    expect(codes({ ...ticket, ticketTransferConfirmed: true, description: "code TKT2026AB98XY" })).toContain("ticket_code_exposed");
    expect(codes({ ...ticket, ticketTransferConfirmed: true, images: [{ qrDetected: true }] })).toContain("ticket_qr_visible");
    expect(codes({ ...ticket, ticketTransferConfirmed: true, images: [{ qrDetected: true }] })).not.toContain("ticket_photo_review");
  });

  it("publishes ticket listings with photos quarantined for review (pilot rule)", () => {
    const ticket = { categorySlug: "event-tickets", categoryIsTicket: true, ticketTransferConfirmed: true, title: "Fest day pass", description: "Unused pass" };
    const decision = evaluate({ ...ticket, images: [{ qrDetected: false }] });
    expect(decision.outcome).toBe("limit");
    expect(decision.reasons.map((r) => r.code)).toEqual(["ticket_photo_review"]);
    // Photo-less ticket listings and photos in other categories still publish immediately.
    expect(evaluate(ticket).outcome).toBe("allow");
    expect(evaluate({ images: [{ qrDetected: false }] }).outcome).toBe("allow");
  });

  it("limits QR codes in non-ticket photos", () => {
    expect(evaluate({ images: [{ qrDetected: true }] }).reasons.map((r) => r.code)).toEqual(["qr_code_in_image"]);
  });

  it("uses behavioural signals from the server", () => {
    expect(evaluate({}, { duplicateOfOwnListing: true }).outcome).toBe("block");
    expect(codes({}, { copiedTextFromOtherSeller: true })).toEqual(["copied_listing_text"]);
    expect(codes({}, { reusedImageFromOtherSeller: true })).toEqual(["reused_image"]);
    expect(codes({}, { recentBlockedListings: 3 })).toEqual(["repeat_policy_violations"]);
    expect(codes({}, { recentBlockedListings: 2 })).toEqual([]);
  });

  it("respects disabled categories and policy edits", () => {
    const policy = { ...DEFAULT_POLICY, disabledCategorySlugs: ["electronics"] };
    expect(codes({}, { policy })).toEqual(["category_disabled"]);
    const custom = { ...DEFAULT_POLICY, rules: [{ id: "x", action: "block" as const, reasonCode: "other_prohibited" as const, terms: ["calculator"] }] };
    expect(evaluate({}, { policy: custom }).outcome).toBe("block");
  });

  it("orders blocking reasons before review reasons", () => {
    const decision = evaluate({ description: "Kitchen knife. Call 9876543210" });
    expect(decision.outcome).toBe("block");
    expect(decision.reasons[0].severity).toBe("block");
    expect(decision.reasons.at(-1)?.severity).toBe("limit");
  });
});

describe("policy schema", () => {
  it("accepts the default policy and rejects malformed configs", () => {
    expect(policySchema.safeParse(DEFAULT_POLICY).success).toBe(true);
    expect(policySchema.safeParse({ ...DEFAULT_POLICY, listingExpiryDays: 0 }).success).toBe(false);
    expect(parsePolicy({ nonsense: true })).toBe(DEFAULT_POLICY);
  });
});
