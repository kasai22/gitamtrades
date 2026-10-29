/**
 * Maps the stable error codes raised by our Postgres functions/triggers (see supabase/migrations)
 * to plain-language copy (PRD Appendix B). Unknown errors fall back to a generic message so internal
 * details never leak to users.
 */
const MESSAGES: Record<string, string> = {
  EMAIL_DOMAIN_NOT_ALLOWED: "Use your university email address. Personal email providers can't be used to join.",
  AGE_CONFIRMATION_REQUIRED: "You must confirm you are 18 or older to join during the pilot.",
  TERMS_ACCEPTANCE_REQUIRED: "Please accept the Terms, Privacy Notice and marketplace rules.",
  NOT_AUTHENTICATED: "Please sign in to continue.",
  NOT_VERIFIED: "Verify your university email to use this feature.",
  SELLING_NOT_ENABLED: "Turn on selling from the Sell page first.",
  SELLING_RESTRICTED: "Your account can't publish listings right now. See your account page for details.",
  MESSAGING_RESTRICTED: "Your account can't send messages right now. See your account page for details.",
  CATEGORY_NOT_AVAILABLE: "That category isn't available. Choose another category.",
  MEETUP_AREA_INVALID: "Choose one of the listed campus meetup areas, or 'Arrange in chat'.",
  TOO_MANY_IMAGES: "You've added too many photos. Remove a few and try again.",
  IMAGE_NOT_OWNED: "One of the photos couldn't be attached. Remove it and upload it again.",
  DECLARATION_REQUIRED: "Please confirm the seller declaration before publishing.",
  TICKET_TRANSFER_CONFIRMATION_REQUIRED: "Confirm that the ticket can be transferred under the event's terms.",
  LISTING_NOT_FOUND: "We couldn't find that listing.",
  LISTING_NOT_EDITABLE: "This listing has been removed and can't be edited.",
  LISTING_REMOVED_BY_ADMIN: "This listing was removed by the safety team. You can request a review from the listing page.",
  ONLY_DRAFTS_CAN_BE_SAVED_AS_DRAFT: "Published listings can't be turned back into drafts. Save your changes instead.",
  INVALID_TRANSITION: "That status change isn't possible for this listing.",
  LISTING_UNDER_REVIEW: "This listing is under review and can't be reactivated until the review is complete.",
  LISTING_NOT_AVAILABLE: "This item is no longer available for new messages.",
  CANNOT_MESSAGE_OWN_LISTING: "This is your own listing.",
  USER_BLOCKED: "You can't message this student.",
  TARGET_NOT_FOUND: "We couldn't find what you're trying to report.",
  CANNOT_REPORT_SELF: "You can't report your own content.",
  DETAILS_TOO_LONG: "Please keep the details under 1,000 characters.",
  NOTHING_TO_APPEAL: "There's nothing to appeal here.",
  APPEAL_TARGET_REQUIRED: "Choose what you're appealing.",
  APPEAL_MESSAGE_INVALID: "Explain your request in 10 to 2,000 characters.",
  "RATE_LIMITED:listings": "You've reached today's listing limit. Try again tomorrow.",
  "RATE_LIMITED:messages": "You're sending messages too quickly. Wait a moment and try again.",
  "RATE_LIMITED:conversations": "You've started a lot of new chats today. Try again tomorrow.",
  "RATE_LIMITED:reports": "You've sent a lot of reports today. Our team is reviewing them.",
  "RATE_LIMITED:appeals": "You've sent a lot of review requests today. Try again tomorrow.",
  FORBIDDEN: "You don't have permission to do that.",
  SIGNUPS_PAUSED: "New sign-ups are paused for a short while. Please try again later.",
  PUBLISHING_PAUSED: "Publishing new listings is paused for a short while. Your draft can still be saved.",
  COMMUNITY_PAUSED: "Community posting is paused for a short while. You can still read threads.",
  CONVERSATION_RESTRICTED: "The safety team has paused this conversation. You can still read earlier messages.",
  COMMUNITY_RESTRICTED: "Your account can't post in the community right now. See your account page for details.",
  POST_NOT_FOUND: "This post isn't available.",
  POST_LOCKED: "This thread is locked by the moderators.",
  PARENT_NOT_FOUND: "The comment you're replying to is no longer available.",
  THREAD_TOO_DEEP: "This thread is as deep as it goes. Reply further up instead.",
  "RATE_LIMITED:posts": "You've posted a lot today. Try again tomorrow.",
  "RATE_LIMITED:comments": "You're commenting too quickly. Wait a moment and try again.",
};

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Returns the first known error code contained in a database/auth error message. */
export function errorCode(error: { message?: string } | null | undefined): string | null {
  const message = error?.message ?? "";
  // Longest codes first so 'RATE_LIMITED:messages' wins over a shorter prefix.
  const codes = Object.keys(MESSAGES).sort((a, b) => b.length - a.length);
  return codes.find((code) => message.includes(code)) ?? null;
}

export function friendlyError(error: { message?: string } | null | undefined, fallback = GENERIC_ERROR): string {
  const code = errorCode(error);
  return code ? MESSAGES[code] : fallback;
}

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export const ok = <T,>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string, fieldErrors?: FieldErrors): { ok: false; error: string; fieldErrors?: FieldErrors } => ({
  ok: false,
  error,
  fieldErrors,
});
