import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { FormMessage } from "@/components/shared/form";
import { getViewer } from "@/lib/auth/session";
import { ResendVerificationForm, VerifyCodeForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const viewer = await getViewer();
  if (viewer?.emailVerified) redirect("/marketplace");
  const email = typeof params.email === "string" ? params.email.slice(0, 254) : (viewer?.email ?? "");
  const linkError = params.error === "link";

  return (
    <>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <MailCheck className="size-6" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Check your university email</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        {email ? <>We sent a verification link and code to <strong className="text-foreground">{email}</strong>. </> : "We sent you a verification link and code. "}
        Open the link, or enter the code below. Your account can&apos;t message or list until it&apos;s verified.
      </p>
      {linkError && <FormMessage className="mb-4" error="That link is invalid or has expired. Enter the code, or request a new email." />}
      {params.unverified === "1" && <FormMessage className="mb-4" error="Please verify your email before signing in." />}
      <VerifyCodeForm email={email} />
      <div className="my-6 border-t" />
      <p className="mb-3 text-sm text-muted-foreground">Didn&apos;t get it? Check spam, or send it again. Links expire after a short time.</p>
      <ResendVerificationForm email={email} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Wrong address? <Link href="/signup" className="font-medium text-primary hover:underline">Sign up again</Link>
      </p>
    </>
  );
}
