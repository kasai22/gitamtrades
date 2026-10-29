import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { appConfig } from "@/lib/config";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { AdminLoginForm } from "@/features/admin/components/admin-login-form";

export const metadata: Metadata = { title: "Admin sign-in" };

/** Public entry point. Uses the same Supabase Auth account; only staff are admitted (checked server-side). */
export default function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
          <h1 className="text-lg font-semibold">{appConfig.name} admin</h1>
        </div>
        <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-muted" />}>
          <LoginBody searchParams={searchParams} />
        </Suspense>
        <p className="mt-5 text-xs text-muted-foreground">
          For authorised staff only. Sign-ins and every privileged action are recorded. Students should use the{" "}
          <Link href="/login" className="text-primary hover:underline">marketplace sign-in</Link>.
        </p>
      </div>
    </main>
  );
}

async function LoginBody({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : "/admin";
  const next = safeNextPath(rawNext, "/admin");
  const expired = params.reason === "expired";
  return (
    <>
      {expired && (
        <p role="status" className="mb-4 rounded-lg bg-info px-3 py-2 text-sm text-info-foreground">
          Your admin session has expired. Sign in again to continue.
        </p>
      )}
      <AdminLoginForm next={next.startsWith("/admin") ? next : "/admin"} />
    </>
  );
}
