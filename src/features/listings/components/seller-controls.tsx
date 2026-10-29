import Link from "next/link";
import { Pencil, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { changeListingStatus, renewListing } from "../actions";
import type { ListingStatus, ModerationStatus } from "../constants";
import { daysUntilExpiry, effectiveStatus, sellerActions } from "../status";

/** LIST-05 / LIST-07: seller status controls. Every change is validated again by change_listing_status(). */
export function SellerControls({
  listing,
  reminderDays,
  compact = false,
}: {
  listing: { id: string; status: ListingStatus; moderationStatus: ModerationStatus; expiresAt: string | null };
  reminderDays: number;
  compact?: boolean;
}) {
  const shape = { status: listing.status, moderation_status: listing.moderationStatus, expires_at: listing.expiresAt };
  const actions = sellerActions(shape);
  const current = effectiveStatus(listing.status, listing.expiresAt);
  const days = daysUntilExpiry(listing.expiresAt);
  const canRenewEarly =
    (current === "active" || current === "on_hold") && listing.moderationStatus === "clear" && days !== null && days <= reminderDays;
  const editable = listing.status !== "removed" && listing.moderationStatus !== "removed";
  const size = compact ? "sm" : "default";

  return (
    <div className="flex flex-wrap gap-2">
      {editable && (
        <Button asChild variant="outline" size={size}>
          <Link href={`/sell/${listing.id}/edit`}>
            <Pencil aria-hidden /> Edit
          </Link>
        </Button>
      )}
      {canRenewEarly && (
        <ActionButton variant="outline" size={size} action={renewListing.bind(null, listing.id)} successMessage="Listing renewed.">
          <RefreshCw aria-hidden /> Renew
        </ActionButton>
      )}
      {actions.map((action) =>
        action.to === "removed" ? (
          <ActionButton
            key={action.to}
            variant="ghost"
            size={size}
            className="text-destructive"
            action={changeListingStatus.bind(null, listing.id, "removed")}
            successMessage="Listing removed."
            confirm={{
              title: "Remove this listing?",
              description: "It will disappear from the marketplace for good. Existing chats stay available.",
              confirmLabel: "Remove",
              destructive: true,
            }}
          >
            {action.label}
          </ActionButton>
        ) : (
          <ActionButton
            key={action.to}
            variant={action.to === "sold" ? "default" : "outline"}
            size={size}
            action={changeListingStatus.bind(null, listing.id, action.to as "active" | "on_hold" | "sold")}
            successMessage={action.to === "sold" ? "Marked as sold. Nice one!" : "Listing updated."}
          >
            {action.label}
          </ActionButton>
        ),
      )}
    </div>
  );
}
