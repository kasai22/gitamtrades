import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetupRequired } from "@/components/shared/setup-required";
import { getViewer } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { SignInForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  if (await getViewer()) redirect(next);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Sign in with your university email.</p>
      <SignInForm next={next} />
    </>
  );
}
