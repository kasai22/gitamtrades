import "server-only";
import { cache } from "react";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/** Platform switches stored in public.platform_settings. Each one is enforced where noted. */
export const SETTING_DEFINITIONS = {
  signups_paused: {
    label: "Pause new sign-ups",
    description: "Rejects new account registrations in the database. Existing students can still sign in.",
    schema: z.boolean(),
    enforcedIn: "handle_new_user() trigger",
  },
  listing_publishing_paused: {
    label: "Pause new listing publication",
    description: "Sellers can still save drafts and manage existing listings, but can't publish new ones. Use only in an emergency; normal listings never need approval.",
    schema: z.boolean(),
    enforcedIn: "listing server actions (the only path to persist_listing)",
  },
  community_posting_paused: {
    label: "Pause community posting",
    description: "Students can read community threads but can't create posts or comments.",
    schema: z.boolean(),
    enforcedIn: "community server actions",
  },
  admin_session_max_hours: {
    label: "Admin session age limit",
    description: "Console sessions older than this must sign in again at /admin/login.",
    schema: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(12), z.literal(24)]),
    enforcedIn: "requireAdmin() and the admin API",
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

export type PlatformSettings = {
  signupsPaused: boolean;
  listingPublishingPaused: boolean;
  communityPostingPaused: boolean;
  adminSessionMaxHours: number;
  /** False when the settings table couldn't be read (defaults are in effect). */
  loaded: boolean;
};

const DEFAULTS: PlatformSettings = {
  signupsPaused: false,
  listingPublishingPaused: false,
  communityPostingPaused: false,
  adminSessionMaxHours: 12,
  loaded: false,
};

/** Reads the platform settings once per request (service role; never exposed to the client as a table). */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  if (!isSupabaseConfigured()) return DEFAULTS;
  const { data, error } = await createAdminClient().from("platform_settings").select("key, value");
  if (error || !data) return DEFAULTS;
  const value = (key: SettingKey) => data.find((row) => row.key === key)?.value;
  const hours = SETTING_DEFINITIONS.admin_session_max_hours.schema.safeParse(value("admin_session_max_hours"));
  return {
    signupsPaused: value("signups_paused") === true,
    listingPublishingPaused: value("listing_publishing_paused") === true,
    communityPostingPaused: value("community_posting_paused") === true,
    adminSessionMaxHours: hours.success ? hours.data : DEFAULTS.adminSessionMaxHours,
    loaded: true,
  };
});
