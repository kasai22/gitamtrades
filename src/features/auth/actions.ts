"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { EMAIL_OTP_LENGTH, appConfig } from "@/lib/config";
import { publicEnv } from "@/lib/env";
import { friendlyError } from "@/lib/errors";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { createAdminClient } from "@/lib/supabase/admin";
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

// Must match the "Email OTP Length" setting in Supabase Auth.
const otpToken = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`), `Enter the ${EMAIL_OTP_LENGTH}-digit code from the email.`);
const otpSchema = z.object({ email, token: otpToken });

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

/** Attempt limits for the password-reset forms, per email address and per IP (on top of Supabase Auth's). */
const RESET_LIMITS = {
  // Campus Wi-Fi can put many students behind one IP, so the IP limits are generous.
  request: { action: "password_reset.request", perEmail: 5, perIp: 30, window: "1 hour" },
  verify: { action: "password_reset.verify", perEmail: 10, perIp: 60, window: "15 minutes" },
} as const;

function attemptKey(action: string, kind: string, value: string) {
  return createHash("sha256").update(`${action}:${kind}:${value}`).digest("hex");
}

/**
 * Records an attempt and returns false once the email or IP is over its limit. Fails open (logs and
 * allows) if the check itself is unavailable, e.g. before the migration is applied, so reset never breaks.
 */
async function resetAttemptAllowed(limit: (typeof RESET_LIMITS)[keyof typeof RESET_LIMITS], emailAddress: string) {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip")?.trim() || "";
  const keys = [attemptKey(limit.action, "email", emailAddress)];
  const limits: number[] = [limit.perEmail];
  if (ip) {
    keys.push(attemptKey(limit.action, "ip", ip));
    limits.push(limit.perIp);
  }
  const { data, error } = await createAdminClient().rpc("auth_attempt_allowed", {
    p_action: limit.action,
    p_keys: keys,
    p_limits: limits,
    p_window: limit.window,
  });
  if (error) {
    console.error("[password-reset] auth_attempt_allowed failed", error.code, error.message);
    return true;
  }
  return data !== false;
}

/**
 * Sends a reset code to a university address. The reply is the same whether or not the address has
 * an account (prevents account enumeration); Auth only emails addresses that do.
 */
export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  // `resend` keeps the form on the code step when a resend fails.
  const values = { email: parsed.data, ...(formData.get("resend") === "1" ? { resend: "1" } : {}) };
  const supabase = await createClient();

  // Which domains are allowed is public, so rejecting a personal address reveals nothing about accounts.
  const { data: domain, error: domainError } = await supabase.rpc("check_email_domain", { p_email: parsed.data });
  if (domainError) {
    console.error("[password-reset] check_email_domain failed", domainError.code, domainError.message);
  } else if (!domain?.[0]?.allowed) {
    return { error: "Use your university email address. Personal addresses (Gmail, Yahoo, Outlook…) can't be used.", values };
  }

  if (!(await resetAttemptAllowed(RESET_LIMITS.request, parsed.data))) {
    return { error: "Too many reset requests. Wait an hour and try again, or use the latest code you received.", values };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().siteUrl}/auth/callback?next=/reset-password`,
  });
  // Auth limits both the interval per address (about a minute) and emails per hour across the project.
  if (error?.status === 429) {
    return { error: "Too many codes were requested. Use the latest code you received, or wait a few minutes and try again.", values };
  }
  if (error) {
    // Auth returns success for unknown addresses, so an error here is a delivery/config problem (e.g. SMTP), not enumeration.
    console.error("[password-reset] resetPasswordForEmail failed", error.status, error.code, error.message);
    return { error: "We couldn't send the code right now. Try again in a few minutes.", values };
  }
  // Same response whether or not the address has an account (prevents account enumeration).
  return {
    message: values.resend
      ? "If an account exists for this email, we've sent a new code. Use the latest one."
      : "If an account exists for this email, we've sent a code. Please check your inbox.",
    values,
  };
}

/** Password recovery with the one-time code from the reset email. */
export async function verifyResetCode(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = otpSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values: { email: raw.email ?? "" } };

  if (!(await resetAttemptAllowed(RESET_LIMITS.verify, parsed.data.email))) {
    return { error: "Too many attempts. Wait 15 minutes, then try again or request a new code.", values: { email: parsed.data.email } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "recovery" });
  if (error || !data.session) {
    if (error?.status === 429) return { error: "Too many attempts. Wait a few minutes and try again.", values: { email: parsed.data.email } };
    return { error: "That code is invalid or has expired. Check it, or resend a new code.", values: { email: parsed.data.email } };
  }
  redirect("/reset-password");
}

const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match." });

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "Your reset session has expired. Request a new code." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    switch (error.code) {
      case "same_password":
        return { error: "Choose a password you haven't used before." };
      case "weak_password":
        // Supabase's password policy can be stricter than the form's checks; its message lists what's missing.
        return { error: error.message || "That password is too weak. Try a longer one with mixed characters." };
      case "session_not_found":
      case "reauthentication_needed":
        return { error: "Your reset session has expired. Request a new code." };
      default:
        console.error("[password-reset] updateUser failed", error.status, error.code, error.message);
        return { error: "Couldn't update the password. Try again." };
    }
  }
  redirect("/account?password=updated");
}
