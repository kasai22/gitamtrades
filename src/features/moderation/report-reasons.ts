import type { Enums } from "@/types/database";

export type ReportReason = Enums<"report_reason">;

/** SAFE-02 report reasons, in the order shown to users. */
export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "prohibited_item", label: "Prohibited or illegal item", hint: "Drugs, weapons, alcohol, fake documents…" },
  { value: "scam", label: "Suspected scam", hint: "Asks for advance payment, OTPs or off-platform transfers" },
  { value: "counterfeit", label: "Counterfeit or fake", hint: "Copies of branded goods, fake tickets" },
  { value: "misleading", label: "Misleading details", hint: "Wrong photos, hidden defects, bait pricing" },
  { value: "harassment", label: "Harassment or abuse", hint: "Threats, insults, unwanted contact" },
  { value: "safety", label: "Safety concern", hint: "Something that could put someone at risk" },
  { value: "spam", label: "Spam", hint: "Repeated or irrelevant posts" },
  { value: "other", label: "Something else", hint: "Tell us what's wrong" },
];

export const REPORT_REASON_VALUES = REPORT_REASONS.map((r) => r.value) as [ReportReason, ...ReportReason[]];

export const REPORT_REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label])) as Record<ReportReason, string>;
