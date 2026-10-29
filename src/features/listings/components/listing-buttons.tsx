"use client";

import { useOptimistic, useTransition } from "react";
import { Heart, Loader2, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startConversation } from "@/features/messaging/actions";
import { toggleFavourite } from "../actions";

export function FavouriteButton({ listingId, initialSaved }: { listingId: string; initialSaved: boolean }) {
  const [saved, setSaved] = useOptimistic(initialSaved);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      aria-pressed={saved}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setSaved(!saved);
          const result = await toggleFavourite(listingId, !saved);
          if (!result.ok) toast.error(result.error);
          else toast.success(result.data.saved ? "Saved for later." : "Removed from saved items.");
        })
      }
    >
      <Heart className={cn(saved && "fill-destructive text-destructive")} aria-hidden />
      {saved ? "Saved" : "Save"}
    </Button>
  );
}

/** "Chat with seller": opens the existing conversation or creates one with the listing attached (CHAT-01). */
export function ContactSellerButton({ listingId, label = "Chat with seller" }: { listingId: string; label?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startConversation(listingId);
          if (result && !result.ok) toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
      {label}
    </Button>
  );
}

export function ShareButton({ title }: { title: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const url = window.location.href.split("?")[0];
        try {
          if (navigator.share) await navigator.share({ title, url });
          else {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied. Only verified students can open it.");
          }
        } catch {
          // The user closed the share sheet.
        }
      }}
    >
      <Share2 aria-hidden /> Share
    </Button>
  );
}
