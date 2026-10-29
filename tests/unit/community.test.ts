import { describe, expect, it } from "vitest";
import { evaluateCommunityText } from "@/features/moderation/engine";
import { DEFAULT_POLICY } from "@/features/moderation/policy";
import { TOPIC_VALUES, isTopic } from "@/features/community/constants";

const check = (body: string, title?: string) => evaluateCommunityText({ title, body }, { policy: DEFAULT_POLICY, policyVersion: 1 });

describe("community text checks", () => {
  it("allows normal discussion, including review-only listing words and links", () => {
    for (const body of [
      "Which mess has the best biryani?",
      "Lost my kitchen knife set in the hostel common room",
      "Fest schedule is on https://example.com/fest-2026",
      "Anyone have notes for Engineering Mathematics II?",
    ]) {
      expect(check(body).outcome, body).toBe("allow");
    }
  });

  it("blocks prohibited items and personal data with specific reasons", () => {
    expect(check("Selling ganja near gate").reasons[0].code).toBe("prohibited_drugs");
    const phone = check("Call me 98765 43210 for notes");
    expect(phone.outcome).toBe("block");
    expect(phone.reasons[0].message).toMatch(/visible to every verified student/);
    expect(check("Pay to rahul@okaxis").reasons[0].code).toBe("payment_details_in_listing");
    expect(check("My aadhaar 1234 5678 9012").reasons[0].code).toBe("sensitive_personal_data");
  });

  it("holds scam phrasing and shortened links for review", () => {
    expect(check("Send token amount first to book").outcome).toBe("limit");
    expect(check("Free laptops: bit.ly/abc123").outcome).toBe("limit");
  });

  it("checks the title as well as the body", () => {
    expect(check("details inside", "Buy MDMA here").outcome).toBe("block");
  });

  it("matches the database topic list", () => {
    expect(TOPIC_VALUES).toEqual(["general", "academics", "hostel-life", "events", "lost-and-found", "advice", "marketplace-tips", "off-topic"]);
    expect(isTopic("events")).toBe(true);
    expect(isTopic("../x")).toBe(false);
  });
});
