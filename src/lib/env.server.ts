import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  secretKey: z
    .string({ message: "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required on the server" })
    .min(20, "SUPABASE_SECRET_KEY looks too short"),
});

let cached: z.infer<typeof serverSchema> | undefined;

/** Server-only secrets. Never import this module from a Client Component. */
export function serverEnv() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    secretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}
