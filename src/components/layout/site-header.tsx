import Link from "next/link";
import { Suspense } from "react";
import { BadgeCheck, Heart, MessageCircle, Plus } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { appConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET, signPath } from "@/lib/storage";
import { getCategories } from "@/features/listings/queries";
import { getUnreadCount } from "@/features/messaging/queries";
import { CategoryMenu, CategoryMenuFallback, HeaderLinks } from "./header-nav";
import { HeaderSearch } from "./header-search";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export function Logo() {
  return (
    <Link href="/" aria-label={`${appConfig.name} home`} className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <BrandLogo variant="mark" alt="" eager className="h-8 sm:hidden" />
      <BrandLogo alt="" eager className="hidden h-9 sm:block" />
    </Link>
  );
}

/**
 * Two-tier header: a sticky bar (logo, search, account actions) and, on large screens, a category
 * and navigation row that scrolls away so it doesn't eat reading space.
 */
export function SiteHeader() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 md:h-[72px] md:flex-nowrap md:gap-x-6 md:py-0">
          <Logo />
          <div className="order-last basis-full md:order-none md:max-w-2xl md:flex-1 md:basis-auto">
            <HeaderSearch />
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Suspense fallback={<div className="h-10 w-28 animate-pulse rounded-lg bg-muted" aria-hidden />}>
              <HeaderActions />
            </Suspense>
          </div>
        </div>
      </header>
      <div className="hidden border-b bg-card lg:block">
        <nav aria-label="Main" className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <Suspense fallback={<CategoryMenuFallback />}>
            <HeaderCategoryMenu />
          </Suspense>
          <HeaderLinks />
          <p className="ml-auto flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
            <BadgeCheck className="size-4 text-success" aria-hidden />
            Verified students only
          </p>
        </nav>
      </div>
    </>
  );
}

async function HeaderCategoryMenu() {
  if (!isSupabaseConfigured()) return <CategoryMenuFallback />;
  const categories = await getCategories();
  return <CategoryMenu categories={categories.map(({ slug, name, icon }) => ({ slug, name, icon }))} />;
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
      <Button asChild variant="ghost" size="icon" className="hidden rounded-full sm:inline-flex">
        <Link href="/account/favourites" aria-label="Saved items">
          <Heart aria-hidden />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="relative hidden rounded-full sm:inline-flex">
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
      <Button asChild className="hidden sm:inline-flex">
        <Link href="/sell">
          <Plus aria-hidden /> Sell an item
        </Link>
      </Button>
      <MobileNav unread={unread} isStaff={viewer.isStaff} />
    </>
  );
}
