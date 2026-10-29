import { REASON_MESSAGES, type PolicyConfig, type ReasonCode } from "./policy";

/**
 * Deterministic listing moderation (SAFE-01). Pure and synchronous, so it is fast (well within the
 * PRD's 3s/6s p95 moderation-latency budget) and fully unit-testable.
 *
 * It does NOT classify image content (nudity, violence) and makes no legal determinations: uncertain
 * signals produce a "limit" outcome (hidden from others, routed to the admin queue), never a silent
 * deletion. See IMPLEMENTATION_PLAN.md I-06 / I-12.
 */
export const ENGINE_VERSION = "1.0.0";

export type ModerationOutcome = "allow" | "limit" | "block";
export type ReasonSeverity = "block" | "limit";
export type ReasonField = "title" | "description" | "images" | "category" | "ticket" | "listing";

export type ModerationReason = {
  code: ReasonCode;
  severity: ReasonSeverity;
  message: string;
  field: ReasonField;
  /** The matched phrase, shown to the seller so they can fix a false positive. */
  match?: string;
};

export type ListingCandidate = {
  title: string;
  description: string;
  categorySlug: string;
  categoryIsTicket: boolean;
  ticketTransferConfirmed: boolean;
  ticketEventName?: string | null;
  images: { qrDetected: boolean }[];
};

export type ModerationContext = {
  policy: PolicyConfig;
  policyVersion: number;
  /** Seller already has an active listing with identical normalised title + description. */
  duplicateOfOwnListing?: boolean;
  /** Another seller's live listing has the same (long) description. */
  copiedTextFromOtherSeller?: boolean;
  /** An attached image's perceptual hash matches another seller's listing image. */
  reusedImageFromOtherSeller?: boolean;
  /** Number of the seller's listings auto-blocked within policy.repeatOffender.windowDays. */
  recentBlockedListings?: number;
};

export type ModerationDecision = {
  outcome: ModerationOutcome;
  reasons: ModerationReason[];
  /** Machine-readable signal ids for the audit trail. */
  signals: string[];
  ruleVersion: string;
};

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

const SPELLED_OUT = /\b(?:[a-z] ){2,}[a-z]\b/g;

function baseNormalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    // Only translate leetspeak inside words (so prices like "500" stay digits).
    .replace(/(?<=[a-z])[013457@$]|[013457@$](?=[a-z])/g, (ch) => LEET[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, " ")
    // "gaaaanja" -> "ganja"
    .replace(/([a-z])\1{2,}/g, "$1")
    .trim();
}

/** Lower-cases, strips accents, undoes simple leetspeak and collapses everything else to single spaces.
 * Letters spelled out with spaces are re-joined: "g a n j a" -> "ganja". */
export function normalizeText(input: string): string {
  return baseNormalize(input).replace(SPELLED_OUT, (run) => run.replace(/ /g, ""));
}

type NormalizedField = { field: ReasonField; text: string; spelledOut: string[] };

function normalizeField(field: ReasonField, input: string): NormalizedField {
  const base = baseNormalize(input);
  return {
    field,
    text: normalizeText(input),
    spelledOut: (base.match(SPELLED_OUT) ?? []).map((run) => run.replace(/ /g, "")),
  };
}

function containsTerm(field: NormalizedField, term: string): boolean {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (` ${field.text} `.includes(` ${normalizedTerm} `)) return true;
  // Evasion like "a d e s i k a t t a": look for the term inside spelled-out runs.
  const compact = normalizedTerm.replace(/ /g, "");
  return compact.length >= 4 && field.spelledOut.some((run) => run.includes(compact));
}

const PATTERNS = {
  // Indian mobile numbers, optionally with +91 / 0 prefix and spaces or dashes.
  phone: /(?<![\d])(?:\+?91[\s-]*|0)?[6-9](?:[\s-]?\d){9}(?![\d])/,
  upi: /\b[a-z0-9._-]{2,}@(?:ok)?(?:upi|ybl|ibl|axl|paytm|apl|yapl|sbi|icici|hdfcbank|axisbank|okaxis|oksbi|okhdfcbank|okicici|kotak|idfcbank|rbl|fbl|freecharge|jupiteraxis|barodampay)\b/i,
  email: /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i,
  aadhaar: /(?<![\d])\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d])/,
  pan: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/,
  messagingLink: /\b(?:wa\.me|chat\.whatsapp\.com|t\.me|telegram\.me|instagram\.com|snapchat\.com)\b/i,
  url: /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|in|net|org|ly|me|io|co|link|xyz|app|site|shop|store|online|gl|gd)\b(?:\/\S*)?/i,
  // "Booking ID: 8F3K29", "ticket no 123456" and similar labelled codes.
  labelledCode: /\b(?:booking|ticket|order|pnr|confirmation)\s*(?:id|no|number|code|ref)?\s*[:#-]?\s*(?=[a-z0-9]*\d)[a-z0-9]{6,}\b/i,
};

/** Finds the first match of `pattern` and reports which field it was in. */
function findPattern(fields: { field: ReasonField; text: string }[], pattern: RegExp) {
  for (const { field, text } of fields) {
    const match = text.match(pattern);
    if (match) return { field, match: match[0].trim() };
  }
  return null;
}

/** Long tokens that look like redeemable codes: 12+ chars with at least 4 digits and 2 letters. */
function findTicketCode(fields: { field: ReasonField; text: string }[]) {
  const labelled = findPattern(fields, PATTERNS.labelledCode);
  if (labelled) return labelled;
  for (const { field, text } of fields) {
    for (const token of text.split(/[^A-Za-z0-9]+/)) {
      if (token.length < 12) continue;
      const digits = token.replace(/[^0-9]/g, "").length;
      const letters = token.replace(/[^A-Za-z]/g, "").length;
      if (digits >= 4 && letters >= 2) return { field, match: token };
    }
  }
  return null;
}

export function evaluateListing(candidate: ListingCandidate, context: ModerationContext): ModerationDecision {
  const { policy } = context;
  const reasons: ModerationReason[] = [];
  const signals: string[] = [];
  const add = (code: ReasonCode, severity: ReasonSeverity, field: ReasonField, match?: string) => {
    // One reason per code keeps explanations readable.
    if (reasons.some((r) => r.code === code)) return;
    reasons.push({ code, severity, field, match, message: REASON_MESSAGES[code] });
    signals.push(match ? `${code}:${field}` : code);
  };

  const rawFields: { field: ReasonField; text: string }[] = [
    { field: "title", text: candidate.title },
    { field: "description", text: candidate.description },
  ];
  if (candidate.categoryIsTicket && candidate.ticketEventName) {
    rawFields.push({ field: "ticket", text: candidate.ticketEventName });
  }
  const normalizedFields = rawFields.map((f) => normalizeField(f.field, f.text));

  // 1. Category-level rules.
  if (policy.disabledCategorySlugs.includes(candidate.categorySlug)) {
    add("category_disabled", "block", "category");
  }
  if (candidate.categoryIsTicket && !candidate.ticketTransferConfirmed) {
    add("ticket_transfer_unconfirmed", "block", "ticket");
  }

  // 2. Configurable term rules (block rules are evaluated first so they take precedence).
  const orderedRules = [...policy.rules].sort((a, b) => (a.action === b.action ? 0 : a.action === "block" ? -1 : 1));
  for (const rule of orderedRules) {
    for (const normalized of normalizedFields) {
      const term = rule.terms.find((t) => containsTerm(normalized, t));
      if (term) {
        add(rule.reasonCode, rule.action, normalized.field, term);
        break;
      }
    }
  }

  // 3. Privacy and payment patterns: contact details stay private by default (PRD §9.2).
  const upi = findPattern(rawFields, PATTERNS.upi);
  if (upi) add("payment_details_in_listing", "block", upi.field, upi.match);
  const messaging = findPattern(rawFields, PATTERNS.messagingLink);
  if (messaging) add("contact_details_in_listing", "block", messaging.field, messaging.match);
  const email = upi ? null : findPattern(rawFields, PATTERNS.email);
  if (email) add("contact_details_in_listing", "block", email.field, email.match);
  const aadhaar = findPattern(rawFields, PATTERNS.aadhaar);
  if (aadhaar) add("sensitive_personal_data", "block", aadhaar.field, aadhaar.match);
  const pan = findPattern(rawFields, PATTERNS.pan);
  if (pan) add("sensitive_personal_data", "block", pan.field, pan.match);
  const phone = aadhaar ? null : findPattern(rawFields, PATTERNS.phone);
  if (phone) add("contact_details_in_listing", "block", phone.field, phone.match);
  const url = email || messaging ? null : findPattern(rawFields, PATTERNS.url);
  if (url) add("external_link", "limit", url.field, url.match);

  // 4. Event tickets: never expose redeemable codes or QR images (PRD §8.2, §8.4).
  if (candidate.categoryIsTicket) {
    const code = findTicketCode(rawFields);
    if (code) add("ticket_code_exposed", "block", code.field, code.match);
    if (candidate.images.some((image) => image.qrDetected)) add("ticket_qr_visible", "block", "images");
    // Pilot decision (29 Oct 2026): 1-D barcodes and printed booking codes in photos aren't detected, so any
    // ticket photo is reviewed by a person before other students see it. Text-only ticket listings publish immediately.
    else if (candidate.images.length > 0) add("ticket_photo_review", "limit", "images");
  } else if (candidate.images.some((image) => image.qrDetected)) {
    add("qr_code_in_image", "limit", "images");
  }

  // 5. Behavioural signals supplied by the server.
  if (context.duplicateOfOwnListing) add("duplicate_listing", "block", "listing");
  if (context.copiedTextFromOtherSeller) add("copied_listing_text", "limit", "description");
  if (context.reusedImageFromOtherSeller) add("reused_image", "limit", "images");
  if ((context.recentBlockedListings ?? 0) >= policy.repeatOffender.blockedListingsThreshold) {
    add("repeat_policy_violations", "limit", "listing");
  }

  const outcome: ModerationOutcome = reasons.some((r) => r.severity === "block")
    ? "block"
    : reasons.length > 0
      ? "limit"
      : "allow";

  // Order: blocking reasons first, so the most important fix is shown first.
  reasons.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "block" ? -1 : 1));

  return { outcome, reasons, signals, ruleVersion: `p${context.policyVersion}/e${ENGINE_VERSION}` };
}

/** Normalised fingerprint used for duplicate-text checks. */
export function textFingerprint(title: string, description: string): string {
  return normalizeText(`${title} ${description}`);
}

// ---------------------------------------------------------------------------
// Community posts and comments
// ---------------------------------------------------------------------------
const SHORTENER = /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|tiny\.cc)\/\S+/i;

const COMMUNITY_MESSAGES: Partial<Record<ReasonCode, string>> = {
  contact_details_in_listing:
    "Remove phone numbers or email addresses. Posts are visible to every verified student; share contact details privately in chat instead.",
  payment_details_in_listing: "Remove UPI IDs or payment details. Never collect money through a post.",
  external_link: "Shortened links hide where they go, so this will be checked first. Paste the full link instead.",
};

/**
 * Checks for community posts and comments. Discussion is broader than selling, so only
 * high-confidence rules block (prohibited items, personal data, payment details); scam phrasing
 * and shortened links are held for review; review-only listing terms (e.g. "knife") are allowed.
 */
export function evaluateCommunityText(
  input: { title?: string; body: string },
  context: { policy: PolicyConfig; policyVersion: number },
): ModerationDecision {
  const reasons: ModerationReason[] = [];
  const signals: string[] = [];
  const add = (code: ReasonCode, severity: ReasonSeverity, field: ReasonField, match?: string) => {
    if (reasons.some((r) => r.code === code)) return;
    reasons.push({ code, severity, field, match, message: COMMUNITY_MESSAGES[code] ?? REASON_MESSAGES[code] });
    signals.push(`${code}:${field}`);
  };
  const rawFields: { field: ReasonField; text: string }[] = [
    ...(input.title ? [{ field: "title" as const, text: input.title }] : []),
    { field: "description", text: input.body },
  ];
  const normalized = rawFields.map((f) => normalizeField(f.field, f.text));

  for (const rule of context.policy.rules) {
    const keep = rule.action === "block" || rule.reasonCode === "possible_scam_language";
    if (!keep) continue;
    for (const field of normalized) {
      const term = rule.terms.find((t) => containsTerm(field, t));
      if (term) {
        add(rule.reasonCode, rule.action, field.field, term);
        break;
      }
    }
  }

  const upi = findPattern(rawFields, PATTERNS.upi);
  if (upi) add("payment_details_in_listing", "block", upi.field, upi.match);
  const email = upi ? null : findPattern(rawFields, PATTERNS.email);
  if (email) add("contact_details_in_listing", "block", email.field, email.match);
  const aadhaar = findPattern(rawFields, PATTERNS.aadhaar) ?? findPattern(rawFields, PATTERNS.pan);
  if (aadhaar) add("sensitive_personal_data", "block", aadhaar.field, aadhaar.match);
  const phone = findPattern(rawFields, PATTERNS.phone);
  if (phone) add("contact_details_in_listing", "block", phone.field, phone.match);
  const shortener = findPattern(rawFields, SHORTENER);
  if (shortener) add("external_link", "limit", shortener.field, shortener.match);

  const outcome: ModerationOutcome = reasons.some((r) => r.severity === "block") ? "block" : reasons.length ? "limit" : "allow";
  reasons.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "block" ? -1 : 1));
  return { outcome, reasons, signals, ruleVersion: `p${context.policyVersion}/e${ENGINE_VERSION}/community` };
}
