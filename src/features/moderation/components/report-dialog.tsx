"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/shared/form";
import { submitReport } from "../actions";
import { REPORT_REASONS, type ReportReason } from "../report-reasons";

const TARGET_COPY = { listing: "this listing", user: "this student", message: "this message", post: "this post", comment: "this comment" } as const;

/** SAFE-02 report flow. The reported user is never told who reported them. */
export function ReportDialog({
  targetType,
  targetId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  targetType: keyof typeof TARGET_COPY;
  targetId: string;
  trigger?: ReactNode;
  /** Controlled mode, e.g. when opened from a dropdown menu item. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setUncontrolledOpen(next));
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ caseNumber: string; alreadyReported: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setReason("");
      setDetails("");
      setError(null);
      setDone(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      {!controlled && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Flag aria-hidden /> Report
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" aria-hidden /> Report received
              </DialogTitle>
              <DialogDescription>
                {done.alreadyReported ? "You've already reported this, and that case is still open. " : "Thanks for helping keep the marketplace safe. "}
                Your case number is <strong className="text-foreground">{done.caseNumber}</strong>. The other student won&apos;t see who reported
                them. You can follow the status under Account → Reports &amp; appeals.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => reset(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!reason) {
                setError("Choose a reason.");
                return;
              }
              startTransition(async () => {
                const result = await submitReport({ targetType, targetId, reason, details: details || undefined });
                if (result.ok) setDone(result.data);
                else setError(result.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Report {TARGET_COPY[targetType]}</DialogTitle>
              <DialogDescription>Reports are confidential. If someone is in immediate danger, contact campus security or call 112.</DialogDescription>
            </DialogHeader>
            <div className="my-4 grid gap-4">
              <FormMessage error={error} />
              <fieldset>
                <legend className="mb-2 text-sm font-medium">What&apos;s wrong?</legend>
                <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)} className="grid gap-2">
                  {REPORT_REASONS.map((r) => (
                    <label key={r.value} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary/50">
                      <RadioGroupItem value={r.value} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">{r.label}</span>
                        <span className="block text-xs text-muted-foreground">{r.hint}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              <div className="grid gap-1.5">
                <label htmlFor={`report-details-${targetId}`} className="text-sm font-medium">
                  Details <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea id={`report-details-${targetId}`} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} placeholder="Anything that helps the safety team understand what happened." />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => reset(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />} Send report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
