import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Package } from "lucide-react";
import { ListingStatusBadge, PriceDisplay, VerificationIndicator } from "@/components/marketplace/badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireVerified } from "@/lib/auth/session";
import { features } from "@/lib/config";
import { initials } from "@/lib/format";
import { getPrivateProfile } from "@/features/account/queries";
import { effectiveStatus } from "@/features/listings/status";
import { ChatThread } from "@/features/messaging/components/chat-thread";
import { getConversation } from "@/features/messaging/queries";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: PageProps<"/messages/[conversationId]">) {
  const { conversationId } = await params;
  const viewer = await requireVerified(`/messages/${conversationId}`);
  // RLS returns nothing for non-participants, so unrelated students get a 404.
  const [conversation, privateProfile] = await Promise.all([getConversation(conversationId, viewer.id), getPrivateProfile(viewer.id)]);
  if (!conversation) notFound();
  const listing = conversation.listing;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col sm:px-6 sm:py-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-x border-b bg-card sm:rounded-2xl sm:border">
        <header className="flex items-center gap-3 border-b p-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back to messages">
            <Link href="/messages"><ArrowLeft aria-hidden /></Link>
          </Button>
          <Avatar className="size-9">
            {conversation.other.avatarUrl && <AvatarImage src={conversation.other.avatarUrl} alt="" />}
            <AvatarFallback>{initials(conversation.other.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{conversation.other.name}</h1>
            <VerificationIndicator verified={conversation.other.emailVerified} />
          </div>
        </header>

        {/* Listing context card (AC-06: both participants see the listing). */}
        {listing ? (
          <Link href={`/listings/${listing.id}`} className="flex items-center gap-3 border-b bg-muted/40 p-3 hover:bg-muted/70">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              {listing.thumbUrl ? (
                <Image src={listing.thumbUrl} alt="" fill unoptimized sizes="48px" className="object-cover" />
              ) : (
                <Package className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{listing.title}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <PriceDisplay priceInr={listing.priceInr} size="sm" />
                {features.meetupAreas && listing.meetupAreaName && <span className="flex items-center gap-1"><MapPin className="size-3" aria-hidden />{listing.meetupAreaName}</span>}
              </div>
            </div>
            <ListingStatusBadge status={effectiveStatus(listing.status, listing.expiresAt)} />
          </Link>
        ) : (
          <p className="border-b bg-muted/40 p-3 text-sm text-muted-foreground">The listing for this chat is no longer available.</p>
        )}

        <ChatThread
          conversationId={conversation.id}
          viewerId={viewer.id}
          otherId={conversation.other.id}
          otherName={conversation.other.name}
          initialMessages={conversation.messages}
          canSend={conversation.canSend}
          blockedByMe={conversation.blockedByMe}
          savedPhone={privateProfile?.contact_phone ?? null}
        />
      </div>
      <p className="px-4 py-2 text-center text-xs text-muted-foreground">
        Messages aren&apos;t orders. Agree the details here, then meet and pay in person.
      </p>
    </div>
  );
}
