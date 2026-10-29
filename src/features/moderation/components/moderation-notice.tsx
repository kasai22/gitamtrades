import Link from "next/link";
import { EyeOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModerationReason } from "../engine";
import type { ModerationStatus } from "@/features/listings/constants";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  images: "Photos",
  category: "Category",
  ticket: "Ticket details",
  listing: "Listing",
};

/** Plain-language explanation + fix/appeal routes for restricted listings (SAFE-01, SAFE-04, AC-12). */
export function ModerationNotice({
  status,
  reasons,
  listingId,
  editable,
}: {
  status: ModerationStatus;
  reasons: ModerationReason[];
  listingId: string;
  editable: boolean;
}) {
  if (status === "clear" || status === "unchecked") return null;
  const blocked = status === "blocked" || status === "removed";
  const Icon = blocked ? ShieldAlert : EyeOff;
  const heading =
    status === "blocked"
      ? "This listing wasn't published"
      : status === "removed"
        ? "This listing was removed by the safety team"
        : "This listing is hidden while it's reviewed";
  const intro =
    status === "blocked"
      ? "Our automated checks found something that goes against the marketplace rules. Fix it and publish again, or ask for a review if you think we got it wrong."
      : status === "removed"
        ? "Other students can't see this listing. If you believe this was a mistake, you can request a review."
        : "Other students can't see it yet. A member of the safety team will check it. You can also edit it to remove what triggered the review.";

  return (
    <section
      role="status"
      className={blocked ? "rounded-xl border border-destructive/30 bg-destructive/5 p-4" : "rounded-xl border border-warning-foreground/20 bg-warning p-4 text-warning-foreground"}
      aria-labelledby={`moderation-${listingId}`}
    >
      <h2 id={`moderation-${listingId}`} className="flex items-center gap-2 font-semibold">
        <Icon className="size-5" aria-hidden /> {heading}
      </h2>
      <p className="mt-1 text-sm">{intro}</p>
      {reasons.length > 0 && (
        <ul className="mt-3 grid gap-2 text-sm">
          {reasons.map((reason) => (
            <li key={reason.code} className="rounded-lg bg-background/70 p-3 text-foreground">
              <p>{reason.message}</p>
              {reason.match && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Found in {FIELD_LABELS[reason.field] ?? reason.field}: <q className="font-medium text-foreground">{reason.match}</q>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {editable && status !== "removed" && (
          <Button asChild size="sm">
            <Link href={`/sell/${listingId}/edit`}>Edit listing</Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={`/appeals/new?listing=${listingId}`}>Request a review</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/policies/prohibited-items">Read the rules</Link>
        </Button>
      </div>
    </section>
  );
}
