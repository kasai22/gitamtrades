import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const TIPS = {
  listing: [
    "Meet in a busy campus spot, like the library entrance or food court.",
    "Never share passwords, OTPs or ID photos with buyers.",
    "Payment happens in person after the buyer inspects the item.",
  ],
  contact: [
    "Inspect the item before you pay; don't send money in advance.",
    "Meet in a public campus location during the day.",
    "Never share OTPs, passwords or photos of your ID.",
  ],
  meetup: [
    "Choose a busy, well-lit campus location and tell a friend where you're going.",
    "Check the item works before paying. You can always walk away.",
    "Pay only in person. The marketplace never collects or holds payments.",
  ],
} as const;

/** SAFE-06: brief, contextual guidance that never blocks normal use. */
export function SafetyTips({ context, className }: { context: keyof typeof TIPS; className?: string }) {
  return (
    <aside className={cn("rounded-xl border border-info-foreground/15 bg-info p-4 text-sm text-info-foreground", className)} aria-label="Safety tips">
      <p className="mb-2 flex items-center gap-2 font-medium">
        <ShieldCheck className="size-4" aria-hidden /> Stay safe
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {TIPS[context].map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <Link href="/safety" className="mt-2 inline-block font-medium underline underline-offset-4">
        More safety guidance
      </Link>
    </aside>
  );
}

/** AC-08 / §9.3: payment and exchange are arranged by students, not the platform. */
export function OfflineTransactionNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Prices are set by the seller and are not binding until you both agree. Students arrange the exchange and payment
      themselves; the marketplace doesn&apos;t process payments, offer buyer protection or guarantee items.
    </p>
  );
}
