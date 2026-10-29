import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

let client: ReturnType<typeof createClient<Database>> | undefined;

/**
 * Service-role client. BYPASSES Row Level Security. Only call it after an explicit authorization
 * check in the data-access layer (src/lib/auth/session.ts) and never pass it to the browser.
 */
export function createAdminClient() {
  if (!client) {
    client = createClient<Database>(publicEnv().supabaseUrl, serverEnv().secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
