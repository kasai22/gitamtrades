import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const LISTING_BUCKET = "listing-images";
export const AVATAR_BUCKET = "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Creates short-lived signed URLs for private objects in one round trip. Signing uses the caller's
 * client, so storage RLS decides whether each object may be read (LIST-03).
 */
export async function signPaths(
  supabase: SupabaseClient<Database>,
  bucket: string,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return result;
  for (const item of data) {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  }
  return result;
}

export async function signPath(supabase: SupabaseClient<Database>, bucket: string, path: string | null | undefined) {
  if (!path) return null;
  return (await signPaths(supabase, bucket, [path])).get(path) ?? null;
}
