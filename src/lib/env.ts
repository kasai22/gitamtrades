import { z } from "zod";

/**
 * Public (browser-safe) configuration. NEXT_PUBLIC_* values must be referenced literally so Next.js
 * can inline them into client bundles. Validation is lazy so static pages build without secrets,
 * but any code path that talks to Supabase fails fast with a clear message.
 */
const publicSchema = z.object({
  supabaseUrl: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL" }),
  supabaseKey: z
    .string({ message: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is required" })
    .min(20, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY looks too short"),
  siteUrl: z.url({ message: "NEXT_PUBLIC_SITE_URL must be a valid URL" }),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | undefined;

function readPublicEnv() {
  return publicSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  });
}

export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = readPublicEnv();
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nCopy .env.example to .env.local and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return readPublicEnv().success;
}
