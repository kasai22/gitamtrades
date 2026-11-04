"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { CategoryIcon } from "@/components/marketplace/category-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type NavCategory = { slug: string; name: string; icon: string };

const triggerClass =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50";

/** "Browse categories" dropdown: the reference design's "shop by category" entry point. */
export function CategoryMenu({ categories }: { categories: NavCategory[] }) {
  if (categories.length === 0) return <CategoryMenuFallback />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass}>
        <LayoutGrid className="size-4" aria-hidden />
        Browse categories
        <ChevronDown className="size-4 opacity-80" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-64">
        {categories.map((c) => (
          <DropdownMenuItem key={c.slug} asChild>
            <Link href={`/categories/${c.slug}`}>
              <CategoryIcon icon={c.icon} className="text-primary" />
              {c.name}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/marketplace" className="font-medium">
            <LayoutGrid aria-hidden /> All listings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shown while categories load, or when they can't be: still a working link to everything. */
export function CategoryMenuFallback() {
  return (
    <Link href="/marketplace" className={triggerClass}>
      <LayoutGrid className="size-4" aria-hidden />
      Browse categories
    </Link>
  );
}

const LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/marketplace?free=1", label: "Free items" },
  { href: "/sell", label: "Sell an item" },
  { href: "/community", label: "Community" },
  { href: "/safety", label: "Safe meetups" },
  { href: "/help", label: "Help" },
];

function isActive(href: string, pathname: string, free: boolean) {
  const [path, query] = href.split("?");
  if (query) return pathname === path && free;
  if (path === "/marketplace") return pathname === path && !free;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Primary links. useSearchParams needs a Suspense boundary, so the fallback renders the same links unhighlighted. */
export function HeaderLinks() {
  return (
    <Suspense fallback={<LinkList pathname="" free={false} />}>
      <ActiveHeaderLinks />
    </Suspense>
  );
}

function ActiveHeaderLinks() {
  const pathname = usePathname();
  const params = useSearchParams();
  return <LinkList pathname={pathname} free={params.get("free") === "1"} />;
}

function LinkList({ pathname, free }: { pathname: string; free: boolean }) {
  return (
    <ul className="flex items-center gap-0.5" role="list">
      {LINKS.map(({ href, label }) => {
        const active = isActive(href, pathname, free);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "text-primary after:absolute after:inset-x-3 after:-bottom-[7px] after:h-0.5 after:rounded-full after:bg-primary hover:text-primary",
              )}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
