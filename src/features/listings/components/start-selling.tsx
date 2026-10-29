"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { enableSelling } from "../actions";

const RULES = [
  "List only items you own and that are legal to sell.",
  "Describe the item honestly, including defects.",
  "Keep payment in person. Never ask buyers for advance transfers or OTPs.",
  "Mark items sold or on hold so nobody wastes a trip.",
];

/** AUTH-03 / AC-02: self-service seller enablement, no admin approval. */
export function StartSelling() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-semibold">Turn on selling</h2>
      <p className="mt-1 text-sm text-muted-foreground">It takes a second and uses the same account. No approval needed.</p>
      <ul className="mt-4 grid gap-2 text-sm">
        {RULES.map((rule) => (
          <li key={rule} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {rule}
          </li>
        ))}
      </ul>
      <label className="mt-5 flex items-start gap-3 text-sm">
        <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
        <span>
          I&apos;ll follow these seller rules and the{" "}
          <Link href="/policies/prohibited-items" className="font-medium text-primary hover:underline" target="_blank">prohibited items policy</Link>.
        </span>
      </label>
      <Button
        className="mt-5"
        size="lg"
        disabled={!agreed || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await enableSelling();
            if (result.ok) {
              toast.success("Selling is on. Let's list your first item.");
              router.refresh();
            } else toast.error(result.error);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />} Start selling
      </Button>
    </div>
  );
}
