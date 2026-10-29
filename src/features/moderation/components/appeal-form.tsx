"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { FormField, FormMessage, SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitAppeal, type AppealState } from "../actions";

export function AppealForm({ listingId, restrictionId }: { listingId?: string; restrictionId?: string }) {
  const [state, action] = useActionState<AppealState, FormData>(submitAppeal, null);
  if (state?.ok) {
    return (
      <div role="status" className="rounded-xl border bg-card p-6">
        <CheckCircle2 className="mb-2 size-6 text-success" aria-hidden />
        <h2 className="font-semibold">{state.alreadyOpen ? "You already have an open request" : "Review requested"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your case number is <strong className="font-mono text-foreground">{state.caseNumber}</strong>. A person on the safety team will review
          it and the outcome will appear under Reports &amp; appeals.
        </p>
        <Button asChild className="mt-4" variant="outline"><Link href="/account/cases">View my cases</Link></Button>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <FormMessage error={state?.error} />
      {listingId && <input type="hidden" name="listingId" value={listingId} />}
      {restrictionId && <input type="hidden" name="restrictionId" value={restrictionId} />}
      <FormField label="What should we look at again?" htmlFor="message" hint="Explain why you think the decision is wrong, or what you've changed.">
        <Textarea id="message" name="message" rows={6} minLength={10} maxLength={2000} required />
      </FormField>
      <div><SubmitButton pendingLabel="Sending…">Request review</SubmitButton></div>
    </form>
  );
}
