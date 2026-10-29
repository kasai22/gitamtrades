import type { ReasonCode } from "./policy";

/**
 * Provider-independent interface for an optional AI/ML content classifier (text or images).
 * No provider is integrated: getContentClassifier() returns null, the deterministic engine
 * (engine.ts) and user reports remain the only moderation inputs, and the admin console says so.
 *
 * To integrate a provider: implement ContentClassifier, return it from getContentClassifier() when
 * its credentials are configured, and merge `classify()` results into the engine decision on the
 * server. Classifier results should only ever *limit* (quarantine for review), never auto-block,
 * until their precision has been measured against appeals.
 */
export type ClassifierInput = {
  kind: "listing" | "community";
  title?: string;
  body: string;
  /** Signed, short-lived URLs of processed images. */
  imageUrls?: string[];
};

export type ClassifierFinding = {
  reasonCode: ReasonCode;
  /** 0..1 provider confidence. */
  confidence: number;
  label: string;
};

export interface ContentClassifier {
  readonly id: string;
  readonly version: string;
  classify(input: ClassifierInput, signal?: AbortSignal): Promise<ClassifierFinding[]>;
}

export type ClassifierStatus = { configured: false; reason: string } | { configured: true; id: string; version: string };

export function getContentClassifier(): ContentClassifier | null {
  return null;
}

export function classifierStatus(): ClassifierStatus {
  const classifier = getContentClassifier();
  return classifier
    ? { configured: true, id: classifier.id, version: classifier.version }
    : { configured: false, reason: "No AI moderation provider is integrated. Automated moderation is deterministic rules, upload checks and report thresholds." };
}

/** Built-in deterministic checks (engine.ts / process-image.ts), described for the admin console. */
export const BUILT_IN_CHECKS: { name: string; action: "block" | "limit"; codes: ReasonCode[]; detail: string }[] = [
  { name: "Restricted keywords", action: "block", codes: ["prohibited_drugs", "prohibited_weapons", "counterfeit"], detail: "Policy rules below, matched after normalising case, accents, leetspeak, spacing and repeated letters." },
  { name: "Contact details", action: "block", codes: ["contact_details_in_listing"], detail: "Phone numbers, email addresses and messaging links in public listing text." },
  { name: "Payment details", action: "block", codes: ["payment_details_in_listing"], detail: "UPI IDs and payment handles." },
  { name: "Personal identifiers", action: "block", codes: ["sensitive_personal_data"], detail: "Aadhaar- and PAN-like numbers." },
  { name: "External links", action: "limit", codes: ["external_link"], detail: "Any URL: quarantined for review instead of published." },
  { name: "Ticket codes and QR", action: "block", codes: ["ticket_code_exposed", "ticket_qr_visible"], detail: "Booking codes in ticket listings; QR codes in ticket photos." },
  { name: "Ticket photos", action: "limit", codes: ["ticket_photo_review"], detail: "Pilot rule: every ticket listing with photos is reviewed before it's shown (barcodes aren't detected). Text-only ticket listings publish immediately." },
  { name: "QR codes in photos", action: "limit", codes: ["qr_code_in_image"], detail: "QR detected at upload (possible payment QR)." },
  { name: "Duplicate listing", action: "block", codes: ["duplicate_listing"], detail: "Same seller, same normalised title and description as an active listing." },
  { name: "Copied text / reused photo", action: "limit", codes: ["copied_listing_text", "reused_image"], detail: "Matches another seller's live listing text or photo content hash." },
  { name: "Repeat violations", action: "limit", codes: ["repeat_policy_violations"], detail: "Seller hit the auto-block threshold within the repeat-offender window." },
  { name: "Report threshold", action: "limit", codes: ["under_review_reports"], detail: "Distinct reporters reached the configured thresholds (database trigger)." },
];
