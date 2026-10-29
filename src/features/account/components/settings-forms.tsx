"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormMessage, SubmitButton } from "@/components/shared/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initials } from "@/lib/format";
import { removeAvatar, requestAccountDeletion, updateContactPhone, updateProfile, type FormState } from "../actions";

export function ProfileForm({ displayName, avatarUrl }: { displayName: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [state, action] = useActionState<FormState, FormData>(updateProfile, null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads?kind=avatar", { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Upload failed.");
      toast.success("Profile photo updated.");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="text-lg">{initials(displayName)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading && <Loader2 className="animate-spin" aria-hidden />} {avatarUrl ? "Change photo" : "Add photo"}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeAvatar();
                  if (result?.error) toast.error(result.error);
                  else router.refresh();
                })
              }
            >
              Remove
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </div>
      <form action={action} className="grid gap-3 sm:max-w-md">
        <FormMessage error={state?.error} message={state?.message} />
        <FormField label="Display name" htmlFor="displayName" hint="Shown on your listings and in chats.">
          <Input id="displayName" name="displayName" defaultValue={displayName} maxLength={50} required />
        </FormField>
        <div><SubmitButton pendingLabel="Saving…">Save profile</SubmitButton></div>
      </form>
    </div>
  );
}

export function ContactPhoneForm({ phone }: { phone: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(updateContactPhone, null);
  return (
    <form action={action} className="grid gap-3 sm:max-w-md">
      <FormMessage error={state?.error} message={state?.message} />
      <FormField label="Phone number" htmlFor="contactPhone" optional hint="Private. Only revealed when you tap Share contact in a specific chat.">
        <Input id="contactPhone" name="contactPhone" type="tel" autoComplete="tel" defaultValue={phone ?? ""} placeholder="+91 98765 43210" />
      </FormField>
      <div><SubmitButton variant="outline" pendingLabel="Saving…">Save number</SubmitButton></div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState<FormState, FormData>(requestAccountDeletion, null);
  return (
    <form action={action} className="grid gap-3 sm:max-w-md">
      <FormMessage error={state?.error} />
      <FormField label="Why are you leaving?" htmlFor="reason" optional>
        <Textarea id="reason" name="reason" rows={2} maxLength={500} />
      </FormField>
      <FormField label={<>Type <strong>DELETE</strong> to confirm</>} htmlFor="confirm">
        <Input id="confirm" name="confirm" autoComplete="off" required />
      </FormField>
      <p className="text-xs text-muted-foreground">
        Your live listings are taken down immediately and you&apos;ll be signed out everywhere. The safety team completes deletion; some
        records may be kept where the law requires (see the Privacy Notice).
      </p>
      <div><SubmitButton variant="destructive" pendingLabel="Submitting…">Request account deletion</SubmitButton></div>
    </form>
  );
}
