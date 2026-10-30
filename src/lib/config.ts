/**
 * Product-level configuration. University-specific data (name, domains, meetup areas) lives in the
 * database; this file holds deploy-time settings that are safe to expose to the browser.
 */
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Gitam Marketplace",
  tagline: "Buy and sell with fellow GITAM students.",
  /** Shown wherever the university is named, to avoid implying official endorsement (PRD Appendix B). */
  independenceNotice:
    "Gitam Marketplace is an independent student marketplace. It is not owned, operated or endorsed by GITAM (Deemed to be University).",
  /** Bump when Terms / Privacy / marketplace rules change; stored with each acceptance. */
  termsVersion: "2026-10-28",
  /** Seller declaration policy version recorded with each listing (LIST-06). */
  sellerDeclarationVersion: "2026-10-28",
  /** Policies' effective date, shown on every policy page. */
  policyEffectiveDate: "28 October 2026",
  /** ADMIN-04 / IT Rules 2021: Grievance Officer published on the Help and policy pages. */
  grievance: {
    name: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME || "Dhanush",
    email: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || "dhanush@gitam-marketplace.in",
    address: process.env.NEXT_PUBLIC_GRIEVANCE_ADDRESS || "",
  },
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "dhanush@gitam-marketplace.in",
} as const;

/**
 * Feature switches. Meetup areas are paused for now: sellers and buyers "Arrange in chat".
 * Set meetupAreas to true to bring back the meetup picker, labels and the admin section.
 */
export const features = {
  meetupAreas: false,
} as const;

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const LISTING_PAGE_SIZE = 24;
