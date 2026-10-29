import type { Metadata } from "next";
import Link from "next/link";
import { FormMessage } from "@/components/shared/form";
import { getViewer } from "@/lib/auth/session";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Reset link expired</h1>
        <FormMessage className="my-4" error="Open the latest reset email on this device, or request a new link." />
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Request a new link</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">For {viewer.email}</p>
      <ResetPasswordForm />
    </>
  );
}
