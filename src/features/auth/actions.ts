"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { appConfig } from "@/lib/config";
import { publicEnv } from "@/lib/env";
import { friendlyError } from "@/lib/errors";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/features/admin/settings";

export type AuthFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
} | null;

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(72, "Use at most 72 characters.")
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Include at least one letter and one number.");

const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the name other students will see.").max(50, "Keep it under 50 characters."),
  email,
  password,
  ageConfirmed: z.literal("on", { message: "You must be 18 or older to join during the pilot." }),
  termsAccepted: z.literal("on", { message: "Please accept the Terms, Privacy Notice and marketplace rules." }),
});

/** AUTH-01/AUTH-02: university-email sign-up. The domain allowlist is also enforced by a DB trigger. */
export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { displayName: raw.displayName ?? "", email: raw.email ?? "" };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors, values };
  // Also enforced by the handle_new_user() trigger; Auth hides trigger messages, so check first for clear copy.
  if ((await getPlatformSettings()).signupsPaused) return { error: friendlyError({ message: "SIGNUPS_PAUSED" }), values };

  const supabase = await createClient();
  const { data: domain, error: domainError } = await supabase.rpc("check_email_domain", { p_email: parsed.data.email });
  if (domainError) {
    // A failed check is a backend problem (e.g. migrations not applied), not a bad email: say so.
    console.error("[signup] check_email_domain failed", domainError.code, domainError.message);
    return { error: "Sign-up is temporarily unavailable. Please try again in a few minutes.", values };
  }
  if (!domain?.[0]?.allowed) {
    return {
      error: "That email isn't from an approved university domain.",
      fieldErrors: { email: ["Use your official university email. Personal addresses (Gmail, Yahoo, Outlook…) can't be verified."] },
      values,
    };
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${publicEnv().siteUrl}/auth/callback?next=/marketplace`,
      data: { display_name: parsed.data.displayName, age_confirmed: true, terms_version: appConfig.termsVersion },
    },
  });
  if (error) {
    const rateLimited = error.status === 429 || /rate limit/i.test(error.message);
    return {
      error: rateLimited ? "Too many attempts. Wait a few minutes and try again." : friendlyError(error, "We couldn't create your account. Try again."),
      values,
    };
  }

  track("signup_started", null, {});
  // Same response whether or not the address already has an account (prevents account enumeration).
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password.").max(200) });

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { email: raw.email ?? "" };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { error: "Enter your email and password.", fieldErrors: parsed.error.flatten().fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}&unverified=1`);
    }
    if (error.status === 429) return { error: "Too many sign-in attempts. Wait a few minutes and try again.", values };
    return { error: "Email or password is incorrect.", values };
  }
  redirect(safeNextPath(raw.next));
}

const otpSchema = z.object({ email, token: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.") });

/** AUTH-02: verify with the 6-digit code (useful when the link is opened on another device). */
export async function verifyEmailCode(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = otpSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values: { email: raw.email ?? "" } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error || !data.user) {
    return { error: "That code is invalid or has expired. Request a new one below.", values: { email: parsed.data.email } };
  }
  track("email_verified", data.user.id, { method: "code" });
  redirect("/marketplace?welcome=1");
}

export async function resendVerification(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter the email you signed up with." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${publicEnv().siteUrl}/auth/callback?next=/marketplace` },
  });
  if (error?.status === 429) return { error: "Please wait a minute before requesting another email.", values: { email: parsed.data } };
  // Generic response either way so the form can't be used to probe which emails exist.
  return { message: "If that address has a pending account, a new verification email is on its way.", values: { email: parsed.data } };
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error?.status === 429) return { error: "Please wait a minute before requesting another email." };
  return { message: "If an account exists for that email, we've sent a link to reset the password." };
}

const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match." });

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.code === "same_password" ? "Choose a password you haven't used before." : "Couldn't update the password. Try again." };
  redirect("/account?password=updated");
}
