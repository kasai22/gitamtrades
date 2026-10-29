import { BadgeCheck, Clock, EyeOff, PauseCircle, ShieldAlert, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MODERATION_LABELS, STATUS_LABELS, type ListingStatus, type ModerationStatus } from "@/features/listings/constants";
import { cn } from "@/lib/utils";

/** PRD Appendix B: say "University email verified", never "identity verified". */
export function VerificationIndicator({ verified, className, compact = false }: { verified: boolean; className?: string; compact?: boolean }) {
  if (!verified) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-success", className)}>
      <BadgeCheck className="size-4" aria-hidden />
      {compact ? <span className="sr-only">University email verified</span> : "University email verified"}
    </span>
  );
}

export function ListingStatusBadge({ status, className }: { status: ListingStatus; className?: string }) {
  const variant = status === "active" ? "success" : status === "on_hold" ? "warning" : status === "draft" ? "outline" : "secondary";
  const Icon = status === "on_hold" ? PauseCircle : status === "sold" ? Tag : status === "expired" ? Clock : null;
  return (
    <Badge variant={variant} className={className}>
      {Icon && <Icon aria-hidden />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ModerationBadge({ status, className }: { status: ModerationStatus; className?: string }) {
  if (status === "clear" || status === "unchecked") return null;
  const variant = status === "limited" ? "warning" : "destructive";
  const Icon = status === "limited" ? EyeOff : ShieldAlert;
  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden />
      {MODERATION_LABELS[status]}
    </Badge>
  );
}

export function PriceDisplay({ priceInr, size = "md", className }: { priceInr: number; size?: "sm" | "md" | "lg"; className?: string }) {
  const free = priceInr === 0;
  return (
    <span
      className={cn(
        "font-semibold tabular-nums tracking-tight",
        size === "sm" && "text-sm",
        size === "md" && "text-base",
        size === "lg" && "text-3xl",
        free && "text-success",
        className,
      )}
    >
      {free ? "Free" : `₹${priceInr.toLocaleString("en-IN")}`}
    </span>
  );
}
