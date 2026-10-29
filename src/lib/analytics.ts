import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * AN-01 / PRD §11.3: first-party product analytics. Event names and property shapes are
 * whitelisted here so no raw email, message body, contact detail or free-text search is recorded
 * by accident. Unknown properties are stripped.
 */
const id = z.uuid();
const EVENTS = {
  signup_started: z.object({ university_domain_id: id.optional(), source: z.string().max(40).optional() }),
  email_verified: z.object({ method: z.enum(["link", "code"]) }),
  seller_enabled: z.object({}),
  listing_started: z.object({}),
  listing_published: z.object({
    listing_id: id,
    category: z.string(),
    outcome: z.enum(["allow", "limit", "block"]),
    rule_version: z.string(),
    time_to_publish_ms: z.number().int().nonnegative().optional(),
    is_edit: z.boolean(),
    image_count: z.number().int(),
  }),
  listing_blocked: z.object({ listing_id: id, category: z.string(), reason_codes: z.array(z.string()), rule_version: z.string() }),
  listing_viewed: z.object({ listing_id: id, category: z.string() }),
  search_submitted: z.object({
    term_count: z.number().int(),
    category: z.string().nullable(),
    filters: z.array(z.string()),
    sort: z.string(),
    result_count: z.number().int(),
    zero_results: z.boolean(),
    /** Only for zero-result searches: letters/spaces only, max 60 chars (IMPLEMENTATION_PLAN I-11). */
    zero_result_query: z.string().max(60).optional(),
  }),
  chat_started: z.object({ conversation_id: id, listing_id: id }),
  message_sent: z.object({ conversation_id: id, kind: z.enum(["text", "contact_share"]), delivered: z.boolean() }),
  contact_shared: z.object({ conversation_id: id }),
  listing_marked_sold: z.object({ listing_id: id, category: z.string(), days_active: z.number().int() }),
  listing_reactivated: z.object({ listing_id: id, from: z.string() }),
  listing_reported: z.object({ case_id: z.string(), reason: z.string(), target_type: z.string(), deduplicated: z.boolean() }),
  moderation_action: z.object({ action: z.string(), target_type: z.string(), case_id: z.string().optional() }),
  appeal_submitted: z.object({ case_id: z.string(), target: z.enum(["listing", "restriction"]) }),
  user_blocked: z.object({}),
  community_post_created: z.object({ post_id: id, topic: z.string(), outcome: z.enum(["allow", "limit"]) }),
  community_comment_created: z.object({ post_id: id, is_reply: z.boolean(), outcome: z.enum(["allow", "limit"]) }),
} as const;

export type AnalyticsEvent = keyof typeof EVENTS;
export type AnalyticsProps<E extends AnalyticsEvent> = z.input<(typeof EVENTS)[E]>;

/** Records an event after the response is sent. Never throws into the caller. */
export function track<E extends AnalyticsEvent>(name: E, userId: string | null, properties: AnalyticsProps<E>) {
  const parsed = EVENTS[name].safeParse(properties);
  if (!parsed.success) {
    console.warn(`[analytics] dropped invalid ${name} event`, parsed.error.issues.map((i) => i.path.join(".")));
    return;
  }
  after(async () => {
    try {
      const { error } = await createAdminClient()
        .from("analytics_events")
        .insert({ name, user_id: userId, properties: parsed.data });
      if (error) console.warn(`[analytics] insert failed for ${name}: ${error.code}`);
    } catch (error) {
      console.warn(`[analytics] insert failed for ${name}`, (error as Error).message);
    }
  });
}

/** Strips anything that could be personal data from a search query (digits, emails, symbols). */
export function sanitizeZeroResultQuery(query: string): string {
  return query.replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
