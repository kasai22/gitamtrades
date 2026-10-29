"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormField, FormMessage, SubmitButton, describedBy } from "@/components/shared/form";
import {
  requestPasswordReset,
  resendVerification,
  signIn,
  signUp,
  updatePassword,
  verifyEmailCode,
  type AuthFormState,
} from "../actions";

export function SignUpForm({ domains }: { domains: string[] }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signUp, null);
  const errors = state?.fieldErrors ?? {};
  const example = domains[0] ? `you@${domains[0]}` : "you@university.edu.in";
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage error={state?.error} />
      <FormField label="Name shown to other students" htmlFor="displayName" errors={errors.displayName} hint="Your first name is enough.">
        <Input id="displayName" name="displayName" autoComplete="given-name" required maxLength={50} defaultValue={state?.values?.displayName} {...describedBy("displayName", errors.displayName, true)} />
      </FormField>
      <FormField
        label="University email"
        htmlFor="email"
        errors={errors.email}
        hint={domains.length ? `Accepted: ${domains.map((d) => `@${d}`).join(", ")}` : "Use your official university email."}
      >
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder={example} defaultValue={state?.values?.email} {...describedBy("email", errors.email, true)} />
      </FormField>
      <FormField label="Password" htmlFor="password" errors={errors.password} hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} {...describedBy("password", errors.password, true)} />
      </FormField>
      <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox name="ageConfirmed" id="ageConfirmed" className="mt-0.5" aria-invalid={errors.ageConfirmed ? true : undefined} />
          <span>I am 18 or older.</span>
        </label>
        {errors.ageConfirmed && <p className="text-sm text-destructive">{errors.ageConfirmed[0]}</p>}
        <label className="flex items-start gap-3 text-sm">
          <Checkbox name="termsAccepted" id="termsAccepted" className="mt-0.5" aria-invalid={errors.termsAccepted ? true : undefined} />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">Terms</Link>,{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">Privacy Notice</Link> and{" "}
            <Link href="/policies/prohibited-items" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">marketplace rules</Link>.
          </span>
        </label>
        {errors.termsAccepted && <p className="text-sm text-destructive">{errors.termsAccepted[0]}</p>}
      </div>
      <SubmitButton size="lg" pendingLabel="Creating account…">Create account</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Already joined? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </form>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signIn, null);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage error={state?.error} />
      {next && <input type="hidden" name="next" value={next} />}
      <FormField label="University email" htmlFor="email" errors={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.values?.email} {...describedBy("email", errors.email)} />
      </FormField>
      <FormField label="Password" htmlFor="password" errors={errors.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required {...describedBy("password", errors.password)} />
      </FormField>
      <div className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">Forgot password?</Link>
      </div>
      <SubmitButton size="lg" pendingLabel="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        New here? <Link href="/signup" className="font-medium text-primary hover:underline">Join with your university email</Link>
      </p>
    </form>
  );
}

export function VerifyCodeForm({ email }: { email: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(verifyEmailCode, null);
  return (
    <form action={action} className="grid gap-3" noValidate>
      <FormMessage error={state?.error} />
      <FormField label="Email" htmlFor="verify-email">
        <Input id="verify-email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email ?? email} />
      </FormField>
      <FormField label="6-digit code" htmlFor="token" hint="The code is in the same email as the link.">
        <Input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="font-mono tracking-[0.3em]" />
      </FormField>
      <SubmitButton pendingLabel="Verifying…">Verify email</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm({ email }: { email: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(resendVerification, null);
  return (
    <form action={action} className="grid gap-3" noValidate>
      <FormMessage error={state?.error} message={state?.message} />
      <input type="hidden" name="email" value={state?.values?.email ?? email} />
      {!email && (
        <FormField label="Email" htmlFor="resend-email">
          <Input id="resend-email" name="email" type="email" required />
        </FormField>
      )}
      <SubmitButton variant="outline" pendingLabel="Sending…">Resend verification email</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(requestPasswordReset, null);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage error={state?.error} message={state?.message} />
      <FormField label="University email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <SubmitButton size="lg" pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(updatePassword, null);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage error={state?.error} />
      <FormField label="New password" htmlFor="password" errors={errors.password} hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required {...describedBy("password", errors.password, true)} />
      </FormField>
      <FormField label="Confirm new password" htmlFor="confirm" errors={errors.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required {...describedBy("confirm", errors.confirm)} />
      </FormField>
      <SubmitButton size="lg" pendingLabel="Saving…">Update password</SubmitButton>
    </form>
  );
}
