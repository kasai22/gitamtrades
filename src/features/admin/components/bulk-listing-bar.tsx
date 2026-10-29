"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormMessage } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { moderateListings } from "../actions";

export const BULK_FORM_ID = "bulk-listings";
const MAX = 50;

const ACTIONS = {
  quarantine: { label: "Quarantine", detail: "Hide from students pending review. Sellers see a review notice and can appeal." },
  remove: { label: "Remove", detail: "Remove for a policy violation. Sellers see your reason and can appeal." },
  restore: { label: "Restore", detail: "Make visible again. Auto-blocked drafts are published immediately." },
} as const;
type BulkAction = keyof typeof ACTIONS;

function selectedIds(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM_ID}"][name="listingIds"]:checked`)].map((i) => i.value);
}

/** Row checkbox, associated with the bulk form by the `form` attribute so the table can stay server-rendered. */
export function BulkCheckbox({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" form={BULK_FORM_ID} name="listingIds" value={id} aria-label={`Select ${label}`} className="size-4 accent-primary" />;
}

export function BulkSelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Select all listings on this page"
      className="size-4 accent-primary"
      onChange={(e) => {
        for (const box of document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM_ID}"][name="listingIds"]`)) box.checked = e.currentTarget.checked;
        document.dispatchEvent(new Event("bulk-change"));
      }}
    />
  );
}

/** Bulk moderation bar: appears when listings are selected; requires a reason and an explicit confirmation. */
export function BulkListingBar() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [action, setAction] = useState<BulkAction | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const update = () => setCount(selectedIds().length);
    document.addEventListener("change", update);
    document.addEventListener("bulk-change", update);
    return () => {
      document.removeEventListener("change", update);
      document.removeEventListener("bulk-change", update);
    };
  }, []);

  const open = (a: BulkAction) => {
    setAction(a);
    setReason("");
    setConfirmed(false);
    setError(null);
  };

  const submit = () =>
    start(async () => {
      if (!action) return;
      const ids = selectedIds();
      const result = await moderateListings({ listingIds: ids, action, reason });
      if (!result.ok) return setError(result.error);
      toast.success(result.message ?? "Done.");
      setAction(null);
      for (const box of document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM_ID}"]`)) box.checked = false;
      setCount(0);
      router.refresh();
    });

  return (
    <>
      <form id={BULK_FORM_ID} onSubmit={(e) => e.preventDefault()} />
      <div
        role="region"
        aria-label="Bulk actions"
        className={count ? "sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-sm" : "sr-only"}
      >
        <span className="text-sm font-medium" aria-live="polite">{count} selected</span>
        {count > MAX && <span className="text-sm text-destructive">Select at most {MAX}.</span>}
        <span className="flex-1" />
        {(Object.keys(ACTIONS) as BulkAction[]).map((a) => (
          <Button key={a} size="sm" variant={a === "remove" ? "destructive" : "outline"} disabled={!count || count > MAX} onClick={() => open(a)}>
            {ACTIONS[a].label}
          </Button>
        ))}
      </div>
      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action && `${ACTIONS[action].label} ${count} listing${count === 1 ? "" : "s"}?`}</DialogTitle>
            <DialogDescription>{action && ACTIONS[action].detail} Listings already in that state are skipped. Each listing gets its own audit record.</DialogDescription>
          </DialogHeader>
          {error && <FormMessage error={error} />}
          <div className="grid gap-1.5">
            <label htmlFor="bulk-reason" className="text-sm font-medium">{action === "remove" ? "Reason shown to sellers" : "Reason (audit log)"}</label>
            <Textarea id="bulk-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I&apos;ve reviewed these {count} listings and this action is proportionate.
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
            <Button variant={action === "remove" ? "destructive" : "default"} disabled={!confirmed || reason.trim().length < 3 || pending} onClick={submit}>
              {pending ? "Working…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
