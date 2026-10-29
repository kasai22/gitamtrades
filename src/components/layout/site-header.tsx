import Link from "next/link";
import { Suspense } from "react";
import { MessageCircle, Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { appConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET, signPath } from "@/lib/storage";
import { getUnreadCount } from "@/features/messaging/queries";
import { HeaderSearch } from "./header-search";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Store className="size-4.5" aria-hidden />
      </span>
      <span className="hidden sm:inline">{appConfig.name}</span>
      <span className="sr-only sm:hidden">{appConfig.name} home</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          <Link href="/marketplace" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Marketplace</Link>
          <Link href="/community" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Community</Link>
        </nav>
        <div className="hidden flex-1 md:block">
          <HeaderSearch />
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Suspense fallback={<div className="h-10 w-28 animate-pulse rounded-lg bg-muted" aria-hidden />}>
            <HeaderActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function HeaderActions() {
  const viewer = isSupabaseConfigured() ? await getViewer() : null;
  if (!viewer) {
    return (
      <>
        <Button asChild variant="ghost">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild>
          <Link href="/signup">Join</Link>
        </Button>
      </>
    );
  }

  const supabase = await createClient();
  const [unread, avatarUrl] = await Promise.all([
    viewer.isVerified ? getUnreadCount() : Promise.resolve(0),
    signPath(supabase, AVATAR_BUCKET, viewer.avatarPath),
  ]);

  return (
    <>
      <Button asChild className="hidden sm:inline-flex">
        <Link href="/sell">
          <Plus aria-hidden /> Sell an item
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="relative hidden sm:inline-flex">
        <Link href="/messages" aria-label={unread ? `Messages, ${unread} unread` : "Messages"}>
          <MessageCircle aria-hidden />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4.5 font-semibold text-white" aria-hidden>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
      </Button>
      <UserMenu name={viewer.displayName} email={viewer.email} avatarUrl={avatarUrl} isStaff={viewer.isStaff} />
      <MobileNav unread={unread} isStaff={viewer.isStaff} />
    </>
  );
}
