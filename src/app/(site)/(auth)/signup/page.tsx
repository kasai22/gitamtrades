import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { getAccessInfo } from "@/features/account/queries";
import { SignUpForm } from "@/features/auth/components/auth-forms";
import { SetupRequired } from "@/components/shared/setup-required";

export const metadata: Metadata = { title: "Join" };

export default async function SignUpPage() {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  if (await getViewer()) redirect("/marketplace");
  const info = await getAccessInfo();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Join {info ? `the ${info.shortName ?? info.name} marketplace` : "the marketplace"}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        {info ? `Only ${info.name} students can join. ` : ""}We&apos;ll send a link to your university email to confirm you belong to
        the campus community.
      </p>
      <SignUpForm domains={info?.domains ?? []} />
    </>
  );
}
