import { z } from "zod";

/** Reason codes shown to sellers. Every code has user-facing copy in REASON_MESSAGES. */
export const REASON_CODES = [
  "prohibited_drugs",
  "prohibited_weapons",
  "counterfeit",
  "forged_documents",
  "identity_documents",
  "digital_accounts",
  "academic_misconduct",
  "regulated_goods",
  "wildlife_animals",
  "hazardous_materials",
  "other_prohibited",
  "needs_review_term",
  "possible_scam_language",
  "contact_details_in_listing",
  "payment_details_in_listing",
  "sensitive_personal_data",
  "external_link",
  "ticket_code_exposed",
  "ticket_qr_visible",
  "ticket_transfer_unconfirmed",
  "ticket_photo_review",
  "qr_code_in_image",
  "category_disabled",
  "duplicate_listing",
  "copied_listing_text",
  "reused_image",
  "repeat_policy_violations",
  "under_review_reports",
  "under_review_safety_team",
  "removed_by_safety_team",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** PRD Appendix B: concrete reason + an action the seller can take. */
export const REASON_MESSAGES: Record<ReasonCode, string> = {
  prohibited_drugs: "Drugs, controlled substances and related items aren't allowed on the marketplace.",
  prohibited_weapons: "Weapons, ammunition and explosives aren't allowed on the marketplace.",
  counterfeit: "Counterfeit or 'copy' branded goods aren't allowed. Only list genuine items.",
  forged_documents: "Fake or forged certificates, mark sheets and IDs aren't allowed.",
  identity_documents: "Identity documents, SIM cards and personal data can't be sold or transferred here.",
  digital_accounts: "Accounts, subscriptions, pirated or cracked software and hacking tools aren't allowed.",
  academic_misconduct: "Leaked papers, exam answers and proxy services aren't allowed.",
  regulated_goods:
    "Alcohol, tobacco, vapes and e-cigarettes, and prescription medicines can't be listed on the marketplace.",
  wildlife_animals: "Wildlife products and protected species can't be listed.",
  hazardous_materials: "Hazardous chemicals and materials can't be listed.",
  other_prohibited: "This item isn't allowed under the marketplace rules.",
  needs_review_term:
    "This listing mentions an item that needs a quick safety check before other students can see it. If it's an everyday item, you can also reword the listing.",
  possible_scam_language:
    "Phrases like 'advance payment', 'token amount' or 'share OTP' are common in scams, so the safety team will check this listing first. Payment should only happen in person after inspecting the item.",
  contact_details_in_listing:
    "Remove phone numbers, email addresses or messaging links. Buyers reach you through in-app chat, where you can choose to share contact details privately.",
  payment_details_in_listing:
    "Remove UPI IDs or payment details. Payment is arranged in person between you and the buyer, never through the listing.",
  sensitive_personal_data: "Remove ID numbers (such as Aadhaar or PAN) from the listing to protect your privacy.",
  external_link:
    "Listings with links are checked by the safety team before they're shown. Remove the link to publish right away.",
  ticket_code_exposed:
    "Remove ticket codes, booking IDs or serial numbers. Share them privately with the buyer only when you complete the exchange.",
  ticket_qr_visible:
    "A photo shows a QR code. Ticket photos must never show QR codes or barcodes. Crop or cover them and upload again.",
  ticket_transfer_unconfirmed: "Confirm that the ticket can be transferred under the event or venue's terms.",
  ticket_photo_review:
    "Ticket photos are checked by the safety team before the listing is shown, because barcodes and booking codes in photos can't all be detected automatically. Make sure no code is visible. Ticket listings without photos are published straight away.",
  qr_code_in_image:
    "A photo contains a QR code, so it will be checked before the listing is shown. If it's a payment QR, remove that photo.",
  category_disabled: "This category is temporarily unavailable. Choose another category if one fits.",
  duplicate_listing: "You already have an active listing with the same details. Edit that listing instead of posting it again.",
  copied_listing_text: "This description matches another student's listing, so it will be checked before it's shown.",
  reused_image: "A photo matches one used in another student's listing. Use your own photos of the item.",
  repeat_policy_violations:
    "Several of your recent listings didn't meet the rules, so new listings are checked before they're shown.",
  under_review_reports: "This listing is temporarily hidden while the safety team reviews reports from other students.",
  under_review_safety_team:
    "This listing is temporarily hidden while the safety team checks it. You'll see the outcome here, and you can request a review.",
  removed_by_safety_team: "The safety team removed this listing.",
};

const ruleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  action: z.enum(["block", "limit"]),
  reasonCode: z.enum(REASON_CODES),
  terms: z.array(z.string().trim().min(2).max(60)).min(1).max(500),
});

export const policySchema = z.object({
  listingExpiryDays: z.number().int().min(7).max(365),
  expiryReminderDays: z.number().int().min(1).max(30),
  maxImagesPerListing: z.number().int().min(1).max(20),
  disabledCategorySlugs: z.array(z.string()).max(50),
  rateLimits: z.object({
    listingsPerDay: z.number().int().min(1).max(1000),
    messagesPerMinute: z.number().int().min(1).max(200),
    messagesPerDay: z.number().int().min(10).max(10000),
    conversationsPerDay: z.number().int().min(1).max(1000),
    reportsPerDay: z.number().int().min(1).max(500),
  }),
  reports: z.object({
    highSeverityAutoLimitThreshold: z.number().int().min(1).max(50),
    anyReasonAutoLimitThreshold: z.number().int().min(1).max(100),
  }),
  repeatOffender: z.object({
    windowDays: z.number().int().min(1).max(365),
    blockedListingsThreshold: z.number().int().min(1).max(100),
  }),
  rules: z.array(ruleSchema).max(100),
});

export type PolicyConfig = z.infer<typeof policySchema>;
export type PolicyRule = z.infer<typeof ruleSchema>;

/**
 * Must stay identical to policy version 1 in supabase/migrations/20261028000005_launch_config.sql
 * (asserted by tests/db/policy.test.ts). Used only when no active policy row can be read.
 */
export const DEFAULT_POLICY: PolicyConfig = {
  listingExpiryDays: 60,
  expiryReminderDays: 7,
  maxImagesPerListing: 8,
  disabledCategorySlugs: [],
  rateLimits: {
    listingsPerDay: 10,
    messagesPerMinute: 20,
    messagesPerDay: 400,
    conversationsPerDay: 30,
    reportsPerDay: 20,
  },
  reports: { highSeverityAutoLimitThreshold: 2, anyReasonAutoLimitThreshold: 3 },
  repeatOffender: { windowDays: 30, blockedListingsThreshold: 3 },
  rules: [
    {
      id: "drugs",
      action: "block",
      reasonCode: "prohibited_drugs",
      terms: ["ganja", "charas", "hashish", "hash oil", "marijuana", "cannabis", "mdma", "ecstasy pills", "lsd", "cocaine", "heroin", "methamphetamine", "meth", "opium", "magic mushrooms", "codeine syrup", "nitrazepam", "alprazolam"],
    },
    {
      id: "weapons",
      action: "block",
      reasonCode: "prohibited_weapons",
      terms: ["pistol", "revolver", "handgun", "shotgun", "country made gun", "desi katta", "katta", "ammunition", "ammo", "grenade", "explosive", "explosives", "gunpowder", "gun powder", "detonator", "stun gun", "taser", "brass knuckles", "knuckle duster", "switchblade", "butterfly knife"],
    },
    {
      id: "counterfeit",
      action: "block",
      reasonCode: "counterfeit",
      terms: ["first copy", "master copy", "mirror copy", "7a quality", "aaa quality", "replica watch", "replica shoes", "replica bag", "fake branded", "duplicate branded", "clone phone"],
    },
    {
      id: "forged-documents",
      action: "block",
      reasonCode: "forged_documents",
      terms: ["fake certificate", "fake marksheet", "fake degree", "degree certificate for sale", "marksheet for sale", "fake id", "fake id card", "fake college id", "fake bonafide", "forged certificate", "forged documents"],
    },
    {
      id: "identity-documents",
      action: "block",
      reasonCode: "identity_documents",
      terms: ["aadhaar card", "aadhar card", "pan card", "voter id", "passport for sale", "student id card", "pre activated sim", "preactivated sim", "activated sim card"],
    },
    {
      id: "digital-accounts",
      action: "block",
      reasonCode: "digital_accounts",
      terms: ["hacked account", "cracked software", "pirated", "netflix account", "prime video account", "spotify premium account", "hotstar account", "instagram account for sale", "gmail accounts", "carding", "otp bypass", "keylogger", "malware", "ransomware", "keygen", "crack version"],
    },
    {
      id: "academic-misconduct",
      action: "block",
      reasonCode: "academic_misconduct",
      terms: ["question paper leak", "leaked paper", "leaked question paper", "exam answers", "proxy attendance", "attendance proxy", "proxy exam", "exam proxy"],
    },
    {
      id: "regulated-goods",
      action: "block",
      reasonCode: "regulated_goods",
      terms: ["vape", "vapes", "vape pod", "e cigarette", "ecigarette", "juul", "heated tobacco", "liquor", "whisky", "whiskey", "vodka", "alcohol for sale", "beer for sale", "wine for sale", "prescription drugs", "prescription medicine", "steroids", "anabolic", "sleeping pills", "abortion pills", "viagra", "gutka", "gutkha", "chewing tobacco", "cigarette packs"],
    },
    {
      id: "wildlife",
      action: "block",
      reasonCode: "wildlife_animals",
      terms: ["ivory", "tiger skin", "rhino horn", "elephant tusk", "star tortoise", "pangolin", "snake skin"],
    },
    {
      id: "hazardous",
      action: "block",
      reasonCode: "hazardous_materials",
      terms: ["chloroform", "cyanide", "mercury for sale", "acid for sale"],
    },
    {
      id: "other-prohibited",
      action: "block",
      reasonCode: "other_prohibited",
      terms: ["human organ", "kidney for sale", "blood for sale", "escort service", "betting tips", "satta"],
    },
    {
      id: "review-weapon-like",
      action: "limit",
      reasonCode: "needs_review_term",
      terms: ["knife", "knives", "dagger", "sword", "katana", "air gun", "air rifle", "airsoft", "bb gun", "crossbow", "nunchaku"],
    },
    {
      id: "review-animals",
      action: "limit",
      reasonCode: "needs_review_term",
      terms: ["puppy", "puppies", "kitten", "kittens", "parrot", "pet bird", "tortoise", "turtle", "pet for sale"],
    },
    {
      id: "review-substances",
      action: "limit",
      reasonCode: "needs_review_term",
      terms: ["weed", "hookah", "tobacco", "cigarette", "cigarettes", "alcohol", "beer", "wine", "crackers", "fireworks", "medicine", "medicines", "injection", "prescription"],
    },
    {
      id: "review-accounts-services",
      action: "limit",
      reasonCode: "needs_review_term",
      terms: ["account for sale", "game account", "assignment writing", "record writing", "thesis writing", "project for sale", "replica", "high copy"],
    },
    {
      id: "scam-language",
      action: "limit",
      reasonCode: "possible_scam_language",
      terms: ["advance payment", "pay in advance", "token amount", "booking amount", "advance booking", "send otp", "share otp", "share the otp", "courier charges", "registration fee", "pay first", "gpay first", "paytm first", "phonepe first", "transfer to my account", "scan qr to receive", "army officer", "i am in army"],
    },
  ],
};

/** Parses a stored policy, falling back to defaults for anything malformed. */
export function parsePolicy(config: unknown): PolicyConfig {
  const parsed = policySchema.safeParse(config);
  return parsed.success ? parsed.data : DEFAULT_POLICY;
}
