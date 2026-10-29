"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/session";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok?: boolean; error?: string; message?: string } | null;

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Use at least 2 characters.").max(50, "Keep it under 50 characters."),
});

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in again." };
  const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  // Column-level grants mean only display_name/avatar_path are writable here.
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data.displayName }).eq("id", viewer.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/account", "layout");
  return { ok: true, message: "Profile updated." };
}

const phoneSchema = z.object({
  contactPhone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9][0-9 -]{7,17}$/, "Enter a valid phone number.")]),
});

/** Saved privately; only ever revealed when the user chooses "Share contact" in a chat (CHAT-02). */
export async function updateContactPhone(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in again." };
  const parsed = phoneSchema.safeParse({ contactPhone: formData.get("contactPhone") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_private")
    .update({ contact_phone: parsed.data.contactPhone || null })
    .eq("id", viewer.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/account/settings");
  return { ok: true, message: parsed.data.contactPhone ? "Saved. It stays private until you share it in a chat." : "Removed." };
}

export async function removeAvatar(): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in again." };
  const supabase = await createClient();
  if (viewer.avatarPath) await supabase.storage.from("avatars").remove([viewer.avatarPath]);
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", viewer.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/account", "layout");
  return { ok: true };
}

/** AUTH-04: deletion request. Listings are taken down immediately; an admin completes deletion. */
export async function requestAccountDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in again." };
  if (formData.get("confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion", {
    p_reason: String(formData.get("reason") ?? "").slice(0, 500) || null,
  });
  if (error) return { error: friendlyError(error) };
  await supabase.auth.signOut({ scope: "global" });
  redirect("/?deletion_requested=1");
}
