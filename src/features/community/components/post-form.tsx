"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, FormMessage, SubmitButton, describedBy } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPost, type PostFormState } from "../actions";
import { MAX_POST_BODY, MAX_POST_TITLE, TOPICS, type Topic } from "../constants";

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function PostForm({ defaultTopic }: { defaultTopic?: Topic }) {
  const [state, action] = useActionState<PostFormState, FormData>(createPost, null);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage error={state?.error} />
      {state?.reasons && state.reasons.length > 0 && (
        <ul className="grid gap-2 text-sm" aria-label="What needs changing">
          {state.reasons.map((r) => (
            <li key={r.code} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              {r.message}
              {r.match && <span className="mt-1 block text-xs text-muted-foreground">Found: <q className="font-medium text-foreground">{r.match}</q></span>}
            </li>
          ))}
        </ul>
      )}
      <FormField label="Topic" htmlFor="topic" errors={errors.topic}>
        <select id="topic" name="topic" className={selectClass} defaultValue={state?.values?.topic || defaultTopic || ""} {...describedBy("topic", errors.topic)}>
          <option value="" disabled>Choose a topic</option>
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}: {t.description}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Title" htmlFor="title" errors={errors.title} hint="Ask a question or start a discussion.">
        <Input id="title" name="title" maxLength={MAX_POST_TITLE} required defaultValue={state?.values?.title} {...describedBy("title", errors.title, true)} />
      </FormField>
      <FormField label="Post" htmlFor="body" optional errors={errors.body}>
        <Textarea id="body" name="body" rows={8} maxLength={MAX_POST_BODY} defaultValue={state?.values?.body} {...describedBy("body", errors.body)} />
      </FormField>
      <p className="text-xs text-muted-foreground">
        Be kind and keep it about campus life. Don&apos;t share phone numbers, IDs or anyone&apos;s personal details. Posts follow the{" "}
        <Link href="/terms" className="font-medium text-primary hover:underline">Terms of Use</Link> and{" "}
        <Link href="/policies/prohibited-items" className="font-medium text-primary hover:underline">marketplace rules</Link>.
      </p>
      <div><SubmitButton size="lg" pendingLabel="Posting…">Post</SubmitButton></div>
    </form>
  );
}
