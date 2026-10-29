"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Submit button that reflects the parent <form action>'s pending state. */
export function SubmitButton({ children, pendingLabel, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-disabled={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}

/** Form-level error summary / success message, announced to screen readers (WCAG error summaries). */
export function FormMessage({ error, message, className }: { error?: string | null; message?: string | null; className?: string }) {
  if (!error && !message) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/10 text-success",
        className,
      )}
    >
      {error ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{error ?? message}</span>
    </div>
  );
}

export function FieldErrorText({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  errors,
  children,
  optional,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  errors?: string[];
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="grid gap-1.5" data-invalid={errors?.length ? true : undefined}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </label>
      {children}
      {hint && !errors?.length && (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldErrorText id={`${htmlFor}-error`} errors={errors} />
    </div>
  );
}

/** aria wiring for an input inside <FormField>. */
export function describedBy(id: string, errors?: string[], hint?: boolean) {
  return {
    "aria-invalid": errors?.length ? true : undefined,
    "aria-describedby": errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}
