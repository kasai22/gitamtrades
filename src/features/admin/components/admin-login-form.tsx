"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminSignIn, type AdminSignInState } from "../auth-actions";

export function AdminLoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<AdminSignInState, FormData>(adminSignIn, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      {state?.error && <FormMessage error={state.error} />}
      <div className="grid gap-1.5">
        <Label htmlFor="admin-email">Email</Label>
        <Input id="admin-email" name="email" type="email" autoComplete="username" required defaultValue={state?.email} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="admin-password">Password</Label>
        <Input id="admin-password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton pendingLabel="Signing in…">Sign in to the console</SubmitButton>
    </form>
  );
}
