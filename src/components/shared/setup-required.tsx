import { Wrench } from "lucide-react";

/** Shown instead of auth/data pages when Supabase environment variables are missing (never fake data). */
export function SetupRequired() {
  return (
    <div role="status" className="text-sm">
      <Wrench className="mb-3 size-6 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">Backend not configured</h1>
      <p className="mt-2 text-muted-foreground">
        This deployment has no Supabase project configured, so sign-up and the marketplace are unavailable. Copy{" "}
        <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code>, add
        your Supabase URL and keys, apply the migrations and restart. See the README.
      </p>
    </div>
  );
}
