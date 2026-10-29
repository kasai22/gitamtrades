import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Public access message data (journey 5.1 step 1): the launch university and its email domains. */
export const getAccessInfo = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("universities")
    .select("id, name, short_name, university_domains (domain, is_active)")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    shortName: data.short_name,
    domains: (data.university_domains ?? []).filter((d) => d.is_active).map((d) => d.domain),
  };
});

export async function getPrivateProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_private")
    .select("contact_phone, terms_version, terms_accepted_at, age_confirmed_at, seller_terms_accepted_at")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function getBlockedUsers(userId: string) {
  const supabase = await createClient();
  const { data: blocks } = await supabase.from("blocks").select("blocked_id, created_at").eq("blocker_id", userId);
  const ids = (blocks ?? []).map((b) => b.blocked_id);
  if (!ids.length) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);
  return (blocks ?? []).map((b) => ({
    id: b.blocked_id,
    name: profiles?.find((p) => p.id === b.blocked_id)?.display_name ?? "Student",
    blockedAt: b.created_at,
  }));
}

export async function getMyCases(userId: string) {
  const supabase = await createClient();
  const [reports, appeals, deletion] = await Promise.all([
    // Reporters read their cases through my_report_cases(): the reports table itself is staff-only.
    supabase.rpc("my_report_cases", { p_limit: 100 }),
    supabase
      .from("appeals")
      .select("id, case_number, status, resolution_summary, created_at, resolved_at, listing_id, restriction_id, listings (title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("account_deletion_requests").select("id, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
  ]);
  const myReports = (reports.data ?? []).flatMap((r) =>
    r.id && r.case_number && r.status && r.reason && r.target_type && r.created_at
      ? [{ ...r, id: r.id, case_number: r.case_number, status: r.status, reason: r.reason, target_type: r.target_type, created_at: r.created_at }]
      : [],
  );
  return { reports: myReports, appeals: appeals.data ?? [], deletionRequests: deletion.data ?? [] };
}
