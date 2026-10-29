import "server-only";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/admin";
import type { Viewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { CATEGORY_ICON_NAMES } from "@/components/marketplace/category-icon";
import { policySchema } from "@/features/moderation/policy";
import { adminError, fromDbError } from "../errors";
import { getPlatformSettings, SETTING_DEFINITIONS, type SettingKey } from "../settings";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function listCategories(actor: Viewer) {
  assertPermission(actor, "config.view");
  const admin = createAdminClient();
  const [{ data: categories, error }, { data: listings }] = await Promise.all([
    admin.from("categories").select("id, slug, name, description, icon, sort_order, is_active, is_ticket, created_at").order("sort_order").order("name"),
    // Aggregate counts only.
    admin.from("listings").select("category_id, status, moderation_status"),
  ]);
  if (error) throw fromDbError(error);
  const counts = new Map<string, { total: number; live: number }>();
  for (const l of listings ?? []) {
    const c = counts.get(l.category_id) ?? { total: 0, live: 0 };
    c.total += 1;
    if (l.status === "active" && l.moderation_status === "clear") c.live += 1;
    counts.set(l.category_id, c);
  }
  return (categories ?? []).map((c) => ({ ...c, listingCount: counts.get(c.id)?.total ?? 0, liveCount: counts.get(c.id)?.live ?? 0 }));
}

export const categoryInput = z
  .object({
    id: z.uuid().optional(),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Use 2–40 lowercase letters, numbers or hyphens."),
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
    description: z.string().trim().max(300).optional().default(""),
    icon: z.enum(CATEGORY_ICON_NAMES),
    isTicket: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .strict();

export async function saveCategory(actor: Viewer, input: z.infer<typeof categoryInput>) {
  assertPermission(actor, "categories.manage");
  const { data, error } = await createAdminClient().rpc("admin_save_category", {
    p_actor: actor.id,
    p_id: input.id ?? null,
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description ?? "",
    p_icon: input.icon,
    p_is_ticket: input.isTicket,
    p_is_active: input.isActive,
  });
  if (error) throw error.code === "23505" ? adminError("DUPLICATE", "Another category already uses that slug.") : fromDbError(error);
  return { id: data };
}

export async function reorderCategories(actor: Viewer, ids: string[]) {
  assertPermission(actor, "categories.manage");
  const { error } = await createAdminClient().rpc("admin_reorder_categories", { p_actor: actor.id, p_ids: ids });
  if (error) throw fromDbError(error);
}

export async function deleteCategory(actor: Viewer, id: string) {
  assertPermission(actor, "categories.manage");
  const { error } = await createAdminClient().rpc("admin_delete_category", { p_actor: actor.id, p_id: id });
  if (error) throw fromDbError(error);
}

// ---------------------------------------------------------------------------
// University, domains, meetup areas, verification overview
// ---------------------------------------------------------------------------
/** Consumer email providers can never be allowlisted as university domains (AUTH-01). */
export const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com", "icloud.com",
  "me.com", "rediffmail.com", "protonmail.com", "proton.me", "aol.com", "zoho.com", "yandex.com", "gmx.com", "mail.com",
]);

export async function getUniversityConfig(actor: Viewer) {
  assertPermission(actor, "config.view");
  const supabase = await createClient();
  const admin = createAdminClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 72 * 3_600_000).toISOString();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const [{ data: universities, error }, total, verified, unverifiedStale, newThisWeek, verifiedThisWeek, lastHour, domains] = await Promise.all([
    supabase
      .from("universities")
      .select("id, slug, name, short_name, city, is_active, created_at, university_domains (id, domain, is_active, note, created_at), meetup_areas (id, name, description, is_active, sort_order)")
      .order("created_at"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).not("email_verified_at", "is", null),
    admin.from("profiles").select("id", { count: "exact", head: true }).is("email_verified_at", null).lt("created_at", threeDaysAgo),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("email_verified_at", weekAgo),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", hourAgo),
    // Aggregated by email domain only (no addresses).
    admin.from("profile_private").select("email_domain"),
  ]);
  if (error) throw fromDbError(error);
  const byDomain = new Map<string, number>();
  for (const row of domains.data ?? []) byDomain.set(row.email_domain, (byDomain.get(row.email_domain) ?? 0) + 1);
  return {
    universities: universities ?? [],
    verification: {
      total: total.count ?? null,
      verified: verified.count ?? null,
      unverified: total.count !== null && verified.count !== null ? total.count - verified.count : null,
      unverifiedOlderThan72h: unverifiedStale.count ?? null,
      registeredLast7Days: newThisWeek.count ?? null,
      verifiedLast7Days: verifiedThisWeek.count ?? null,
      registeredLastHour: lastHour.count ?? null,
      byEmailDomain: [...byDomain].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count),
    },
  };
}

export const universityInput = z
  .object({
    universityId: z.uuid(),
    name: z.string().trim().min(2).max(120),
    shortName: z.string().trim().max(30).optional().default(""),
    city: z.string().trim().max(80).optional().default(""),
  })
  .strict();

export async function updateUniversity(actor: Viewer, input: z.infer<typeof universityInput>) {
  assertPermission(actor, "university.manage");
  const { error } = await createAdminClient().rpc("admin_update_university", {
    p_actor: actor.id,
    p_id: input.universityId,
    p_name: input.name,
    p_short_name: input.shortName ?? "",
    p_city: input.city ?? "",
  });
  if (error) throw fromDbError(error);
}

export const domainInput = z
  .object({
    universityId: z.uuid(),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "Enter a domain like students.example.edu.in"),
    note: z.string().trim().max(200).optional().default(""),
  })
  .strict();

export async function addDomain(actor: Viewer, input: z.infer<typeof domainInput>) {
  assertPermission(actor, "university.manage");
  if (GENERIC_EMAIL_DOMAINS.has(input.domain)) throw adminError("INVALID_REQUEST", "Personal email providers can't be allowlisted.");
  const { error } = await createAdminClient().rpc("admin_add_domain", {
    p_actor: actor.id,
    p_university_id: input.universityId,
    p_domain: input.domain,
    p_note: input.note ?? "",
  });
  if (error) throw error.code === "23505" ? adminError("DUPLICATE", "That domain is already listed.") : fromDbError(error);
}

export const domainActiveInput = z
  .object({ domainId: z.uuid(), active: z.boolean(), reason: z.string().trim().min(3, "Record a reason (at least 3 characters).").max(500) })
  .strict();

export async function setDomainActive(actor: Viewer, input: z.infer<typeof domainActiveInput>) {
  assertPermission(actor, "university.manage");
  const { error } = await createAdminClient().rpc("admin_set_domain_active", {
    p_actor: actor.id,
    p_domain_id: input.domainId,
    p_active: input.active,
    p_reason: input.reason,
  });
  if (error) throw fromDbError(error);
}

export const meetupInput = z
  .object({ universityId: z.uuid(), name: z.string().trim().min(2).max(80), description: z.string().trim().max(200).optional().default("") })
  .strict();

export async function addMeetupArea(actor: Viewer, input: z.infer<typeof meetupInput>) {
  assertPermission(actor, "university.manage");
  const { error } = await createAdminClient().rpc("admin_add_meetup_area", {
    p_actor: actor.id,
    p_university_id: input.universityId,
    p_name: input.name,
    p_description: input.description ?? "",
  });
  if (error) throw error.code === "23505" ? adminError("DUPLICATE", "That meetup area already exists.") : fromDbError(error);
}

export async function setMeetupAreaActive(actor: Viewer, areaId: string, active: boolean) {
  assertPermission(actor, "university.manage");
  const { error } = await createAdminClient().rpc("admin_set_meetup_area_active", { p_actor: actor.id, p_area_id: areaId, p_active: active });
  if (error) throw fromDbError(error);
}

// ---------------------------------------------------------------------------
// Platform settings
// ---------------------------------------------------------------------------
export async function getSettings(actor: Viewer) {
  assertPermission(actor, "config.view");
  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .select("key, value, updated_at, updated_by, editor:profiles!platform_settings_updated_by_fkey (display_name)");
  if (error) throw fromDbError(error);
  return { rows: data ?? [], effective: await getPlatformSettings() };
}

export const settingInput = z
  .object({
    key: z.enum(Object.keys(SETTING_DEFINITIONS) as [SettingKey, ...SettingKey[]]),
    value: z.unknown(),
    reason: z.string().trim().min(3, "Record a reason (at least 3 characters).").max(500),
  })
  .strict();

export async function updateSetting(actor: Viewer, input: z.infer<typeof settingInput>) {
  assertPermission(actor, "settings.manage");
  const parsed = SETTING_DEFINITIONS[input.key].schema.safeParse(input.value);
  if (!parsed.success) throw adminError("INVALID_REQUEST", "That value isn't allowed for this setting.");
  const { error } = await createAdminClient().rpc("admin_set_setting", {
    p_actor: actor.id,
    p_key: input.key,
    p_value: parsed.data as Json,
    p_reason: input.reason,
  });
  if (error) throw fromDbError(error);
}

// ---------------------------------------------------------------------------
// Moderation policy (rules, thresholds, limits)
// ---------------------------------------------------------------------------
export async function getModerationConfig(actor: Viewer) {
  assertPermission(actor, "moderation.view");
  const supabase = await createClient();
  const [{ data: versions, error }, { data: events }, { data: categories }] = await Promise.all([
    supabase
      .from("policy_versions")
      .select("id, version, is_active, note, created_at, config, creator:profiles!policy_versions_created_by_fkey (display_name)")
      .order("version", { ascending: false })
      .limit(50),
    supabase
      .from("moderation_events")
      .select("id, action, source, reason_codes, rule_version, listing_id, forum_post_id, subject_user_id, created_at")
      .in("source", ["automated_check", "user_reports", "system"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("categories").select("slug, name, is_active").order("sort_order"),
  ]);
  if (error) throw fromDbError(error);
  const active = (versions ?? []).find((v) => v.is_active) ?? null;
  const parsed = active ? policySchema.safeParse(active.config) : null;
  return {
    versions: versions ?? [],
    active,
    activeConfig: parsed?.success ? parsed.data : null,
    automatedEvents: events ?? [],
    categories: categories ?? [],
  };
}

export const policyInput = z
  .object({ config: z.unknown(), note: z.string().trim().min(3, "Describe what changed (at least 3 characters).").max(500), activate: z.boolean() })
  .strict();

export async function createPolicyVersion(actor: Viewer, input: z.infer<typeof policyInput>) {
  assertPermission(actor, "moderation.manage");
  const parsed = policySchema.safeParse(input.config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw adminError("INVALID_REQUEST", `Invalid policy at "${issue?.path.join(".") || "root"}": ${issue?.message}`);
  }
  const ids = parsed.data.rules.map((r) => r.id);
  if (new Set(ids).size !== ids.length) throw adminError("INVALID_REQUEST", "Each rule needs a unique ID.");
  const { data, error } = await createAdminClient().rpc("admin_create_policy_version", {
    p_actor: actor.id,
    p_config: parsed.data as unknown as Json,
    p_note: input.note,
    p_activate: input.activate,
  });
  if (error) throw fromDbError(error);
  return { version: data };
}

export async function activatePolicyVersion(actor: Viewer, policyId: string) {
  assertPermission(actor, "moderation.manage");
  const supabase = await createClient();
  const { data: target } = await supabase.from("policy_versions").select("config").eq("id", policyId).maybeSingle();
  if (!target) throw adminError("NOT_FOUND");
  if (!policySchema.safeParse(target.config).success) throw adminError("INVALID_REQUEST", "That version is no longer valid and can't be activated.");
  const { data, error } = await createAdminClient().rpc("admin_activate_policy", { p_actor: actor.id, p_policy_id: policyId });
  if (error) throw fromDbError(error);
  return { version: data };
}
