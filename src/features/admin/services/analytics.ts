import "server-only";
import { assertPermission } from "@/lib/auth/admin";
import type { Viewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fromDbError } from "../errors";
import { ADMIN_TIME_ZONE, type DateRange } from "../lib/date-range";

/** Shapes returned by admin_overview() / admin_analytics() (aggregates only). */
export type OverviewData = {
  range: { from: string; to: string; tz: string };
  students: { total: number; verified: number; sellers: number; new_in_range: number; verified_in_range: number };
  listings: {
    live: number; reserved: number; sold: number; expired: number; draft: number; quarantined: number; blocked: number;
    removed: number; flagged: number; created_in_range: number; published_in_range: number;
  };
  conversations: { total: number; in_range: number };
  reports: {
    open: number; in_review: number; escalated: number; actioned: number; dismissed: number; resolved: number;
    urgent_open: number; unassigned_open: number; in_range: number; reported_listings_open: number; reported_users_open: number;
  };
  safety: { active_restrictions: number; active_suspensions: number; open_appeals: number; pending_deletions: number };
  series: { day: string; registrations: number; listings: number; reports: number }[];
  categories: { slug: string; name: string; is_active: boolean; live: number; total: number }[];
};

export type AnalyticsData = {
  range: { from: string; to: string; tz: string };
  tracking: { search_events: boolean; listing_view_events: boolean; first_search_event_at: string | null };
  series: {
    day: string; registrations: number; verifications: number; listings_created: number; listings_published: number;
    listings_sold: number; conversations: number; reports: number; searches: number; zero_result_searches: number; listing_views: number;
  }[];
  verification: { registered_in_range: number; verified_of_registered: number; unverified_older_than_72h: number };
  listings_now: { live: number; reserved: number; sold: number; quarantined: number };
  categories: { slug: string; name: string; created: number; sold: number; conversations: number; live: number }[];
  reports_by_reason: { reason: string; count: number; high: number }[];
  reports_by_severity: Record<string, number>;
  resolution: { closed: number; median_hours: number | null; p90_hours: number | null };
  first_response: { responded: number; median_hours: number | null };
  moderation: Record<string, number>;
  enforcement: {
    active_suspensions: number; new_restrictions: number; new_suspensions: number; repeat_violators: number;
    appeals_submitted: number; appeals_overturned: number; appeals_upheld: number;
  };
};

export async function getOverview(actor: Viewer, range: DateRange): Promise<OverviewData> {
  assertPermission(actor, "overview.view");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview", { p_from: range.from, p_to: range.to, p_tz: ADMIN_TIME_ZONE });
  if (error) throw fromDbError(error);
  return data as unknown as OverviewData;
}

export async function getAnalytics(actor: Viewer, range: DateRange): Promise<AnalyticsData> {
  assertPermission(actor, "analytics.view");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_analytics", { p_from: range.from, p_to: range.to, p_tz: ADMIN_TIME_ZONE });
  if (error) throw fromDbError(error);
  return data as unknown as AnalyticsData;
}
