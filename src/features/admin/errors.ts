/**
 * Errors raised by the admin_* database functions and the admin services, mapped to an HTTP status
 * and operator-facing copy. Unknown errors become a generic 500 so internals never leak.
 */
export class AdminError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

const CODES: Record<string, { status: number; message: string }> = {
  FORBIDDEN: { status: 403, message: "Your role doesn't allow this action." },
  NOT_FOUND: { status: 404, message: "That record no longer exists." },
  INVALID_REQUEST: { status: 400, message: "The request wasn't valid." },
  REASON_REQUIRED: { status: 400, message: "Record a reason (at least 3 characters; 10 for conversation access)." },
  RESOLUTION_REQUIRED: { status: 400, message: "Choose a resolution and write a summary for the reporter." },
  INVALID_TRANSITION: { status: 409, message: "A case can only go back to Open by reopening it after it was closed." },
  INVALID_ASSIGNEE: { status: 409, message: "Reports can only be assigned to staff who can view reports." },
  CANNOT_TARGET_SELF: { status: 409, message: "You can't take this action on your own account or a conversation you're part of." },
  TARGET_IS_STAFF: { status: 409, message: "Only a Super Admin can restrict another staff account." },
  TARGET_NOT_ELIGIBLE: { status: 409, message: "Roles can only be granted to verified accounts that aren't suspended." },
  LAST_SUPER_ADMIN: { status: 409, message: "This is the last active Super Admin. Grant the role to someone else first." },
  ALREADY_LIFTED: { status: 409, message: "This restriction was already lifted." },
  ALREADY_RESOLVED: { status: 409, message: "This appeal has already been resolved." },
  NOTHING_SELECTED: { status: 400, message: "Select at least one listing." },
  BULK_LIMIT: { status: 400, message: "Bulk actions are limited to 50 listings at a time." },
  REPORT_MISMATCH: { status: 409, message: "That report isn't about this listing, account or conversation." },
  ACCESS_GRANT_REQUIRED: { status: 403, message: "Record an investigation reason before viewing messages, or your access window has ended." },
  CATEGORY_IN_USE: { status: 409, message: "Listings use this category, so its slug and ticket type can't change and it can't be deleted. Disable it instead." },
  LAST_ACTIVE_CATEGORY: { status: 409, message: "At least one category must stay enabled." },
  INVALID_ORDER: { status: 400, message: "The new order must include every category exactly once." },
  LAST_ACTIVE_DOMAIN: { status: 409, message: "This is the university's last active domain. Pause sign-ups in Settings instead of disabling it." },
  APPEND_ONLY: { status: 409, message: "Audit records can't be changed." },
  INVALID_RANGE: { status: 400, message: "The end date must be on or after the start date." },
  RANGE_TOO_LONG: { status: 400, message: "Choose a range of one year or less." },
  "RATE_LIMITED:admin": { status: 429, message: "You've reached the hourly limit for this action. Try again later." },
  SESSION_EXPIRED: { status: 401, message: "Your admin session has expired. Sign in again." },
  UNAUTHENTICATED: { status: 401, message: "Sign in to continue." },
  DUPLICATE: { status: 409, message: "That value is already in use." },
};

const ORDERED_CODES = Object.keys(CODES).sort((a, b) => b.length - a.length);

export function adminError(code: keyof typeof CODES | string, message?: string): AdminError {
  const known = CODES[code];
  return new AdminError(code, message ?? known?.message ?? "Something went wrong.", known?.status ?? 500);
}

/** Converts a Supabase/PostgREST error into an AdminError (matches our stable exception codes). */
export function fromDbError(error: { message?: string; code?: string } | null | undefined): AdminError {
  if (error?.code === "23505") return adminError("DUPLICATE");
  const message = error?.message ?? "";
  const code = ORDERED_CODES.find((c) => message.includes(c));
  if (code) return adminError(code);
  console.error("[admin] unexpected database error", error?.code, message.slice(0, 200));
  return new AdminError("INTERNAL", "Something went wrong. Please try again.", 500);
}

export function toAdminError(error: unknown): AdminError {
  if (error instanceof AdminError) return error;
  console.error("[admin] unexpected error", error instanceof Error ? error.message : error);
  return new AdminError("INTERNAL", "Something went wrong. Please try again.", 500);
}
