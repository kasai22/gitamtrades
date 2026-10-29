"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Heart, Home, LayoutDashboard, LogOut, Menu, MessageCircle, MessagesSquare, Package, Plus, Settings, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { HeaderSearch } from "./header-search";

const LINKS = [
  { href: "/marketplace", label: "Browse", icon: Home },
  { href: "/community", label: "Community", icon: MessagesSquare },
  { href: "/sell", label: "Sell an item", icon: Plus },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/account/listings", label: "My listings", icon: Package },
  { href: "/account/favourites", label: "Saved items", icon: Heart },
  { href: "/account", label: "Account", icon: User },
  { href: "/account/settings", label: "Settings", icon: Settings },
  { href: "/safety", label: "Safety tips", icon: ShieldCheck },
];

/** MobileNavigation: a sheet with search and every primary destination (core tasks at 360px, AC-14). */
export function MobileNav({ unread, isStaff }: { unread: number; isStaff: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const links = isStaff ? [...LINKS, { href: "/admin", label: "Admin console", icon: LayoutDashboard }] : LINKS;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative sm:hidden" aria-label={unread ? `Menu, ${unread} unread messages` : "Menu"}>
          <Menu aria-hidden />
          {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive" aria-hidden />}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 max-w-[85vw]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <HeaderSearch />
        </div>
        <nav aria-label="Mobile" className="mt-2 flex flex-col px-2" onClick={() => setOpen(false)}>
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-secondary text-secondary-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {href === "/messages" && unread > 0 && (
                  <span className="ml-auto rounded-full bg-destructive px-2 text-xs text-white">{unread}</span>
                )}
              </Link>
            );
          })}
          <form action="/auth/signout" method="post" className="mt-2 border-t pt-2">
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-muted">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </form>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
