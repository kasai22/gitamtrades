import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Package } from "lucide-react";
import { EmptyState, PageContainer, PageHeader } from "@/components/shared/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { requireVerified } from "@/lib/auth/session";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listConversations } from "@/features/messaging/queries";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const viewer = await requireVerified("/messages");
  const conversations = await listConversations(viewer.id);

  return (
    <PageContainer size="md">
      <PageHeader title="Messages" description="Chats about items you're buying or selling." />
      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="When you message a seller, or a buyer messages you about your listing, the chat will appear here."
          action={{ href: "/marketplace", label: "Browse listings" }}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card" role="list">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className="flex items-center gap-3 p-3 outline-none hover:bg-muted/60 focus-visible:bg-muted sm:p-4">
                <div className="relative">
                  <div className="relative size-12 overflow-hidden rounded-lg bg-muted">
                    {c.listingThumbUrl ? (
                      <Image src={c.listingThumbUrl} alt="" fill unoptimized sizes="48px" className="object-cover" />
                    ) : (
                      <Package className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <Avatar className="absolute -right-1.5 -bottom-1.5 size-6 border-2 border-card">
                    {c.otherAvatarUrl && <AvatarImage src={c.otherAvatarUrl} alt="" />}
                    <AvatarFallback className="text-[10px]">{initials(c.otherName)}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>
                      {c.otherName} <span className="font-normal text-muted-foreground">· {c.role === "buyer" ? "Seller" : "Buyer"}</span>
                    </p>
                    {c.lastMessageAt && <time dateTime={c.lastMessageAt} className="shrink-0 text-xs text-muted-foreground">{formatRelative(c.lastMessageAt)}</time>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{c.listingTitle}</p>
                  <p className={cn("truncate text-sm", c.unread ? "text-foreground" : "text-muted-foreground")}>
                    {c.lastMessagePreview ?? "No messages yet"}
                  </p>
                </div>
                {c.unread && <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
