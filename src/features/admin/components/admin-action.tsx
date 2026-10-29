"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FormMessage, SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { runAdminAction, type AdminFormState } from "../form-action";

type Props = {
  op: string;
  fields: Record<string, string>;
  label: ReactNode;
  title: string;
  description?: ReactNode;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  className?: string;
  size?: "default" | "sm";
  /** Ask for a reason (recorded in the audit log / shown to the user where applicable). */
  reasonLabel?: string;
  reasonRequired?: boolean;
  /** Extra form controls rendered inside the dialog (e.g. a duration select). */
  extra?: ReactNode;
  confirmLabel?: string;
  /** Require typing this word before confirming (role changes, deletions). Re-checked on the server. */
  confirmWord?: string;
  /** Minimum reason length (defaults to 3; conversation access needs 10). */
  reasonMinLength?: number;
};

/** Dialog that submits an admin operation through runAdminAction (server-authorized and audited). */
export function AdminActionDialog({ op, fields, label, title, description, variant = "outline", size = "sm", reasonLabel, reasonRequired = true, extra, confirmLabel, confirmWord, reasonMinLength = 3, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<AdminFormState, FormData>(async (prev, form) => {
    const result = await runAdminAction(prev, form);
    if (result?.ok) {
      toast.success(result.message ?? "Done.");
      setOpen(false);
      router.refresh();
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <input type="hidden" name="op" value={op} />
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {state && !state.ok && <FormMessage error={state.error} />}
          {extra}
          {reasonLabel && (
            <div className="grid gap-1.5">
              <label htmlFor={`reason-${op}`} className="text-sm font-medium">{reasonLabel}</label>
              <Textarea id={`reason-${op}`} name="reason" rows={3} maxLength={1000} required={reasonRequired} minLength={reasonRequired ? reasonMinLength : undefined} />
            </div>
          )}
          {confirmWord && (
            <div className="grid gap-1.5">
              <label htmlFor={`confirm-${op}`} className="text-sm font-medium">
                Type <code className="rounded bg-muted px-1">{confirmWord}</code> to confirm
              </label>
              <input id={`confirm-${op}`} name="confirm" required pattern={confirmWord} autoComplete="off" className="h-10 rounded-lg border border-input bg-card px-3 text-sm" />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton variant={variant === "destructive" ? "destructive" : "default"} pendingLabel="Working…">{confirmLabel ?? "Confirm"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One-click admin operation without a dialog (e.g. toggles). */
export function AdminInlineAction({ op, fields, label, variant = "outline" }: { op: string; fields: Record<string, string>; label: ReactNode; variant?: "outline" | "ghost" | "default" }) {
  const router = useRouter();
  const [state, action] = useActionState<AdminFormState, FormData>(runAdminAction, null);
  useEffect(() => {
    if (state?.ok) router.refresh();
    if (state && !state.ok) toast.error(state.error);
  }, [state, router]);
  return (
    <form action={action}>
      <input type="hidden" name="op" value={op} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size="sm">{label}</SubmitButton>
    </form>
  );
}
