"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  Flag,
  FolderTree,
  Gavel,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Settings,
  ShieldAlert,
  Store,
  Trash2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isActiveNav, SEGMENT_LABELS, type NavGroup, type NavIcon } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  reports: Flag,
  listings: Package,
  users: Users,
  appeals: Gavel,
  community: MessagesSquare,
  messages: ShieldAlert,
  moderation: ClipboardList,
  categories: FolderTree,
  universities: GraduationCap,
  analytics: BarChart3,
  audit: ClipboardList,
  settings: Settings,
  roles: KeyRound,
  deletions: Trash2,
};

export const SIDEBAR_COOKIE = "admin_sidebar";

type ShellProps = {
  nav: NavGroup[];
  user: { name: string; roles: string[] };
  initialCollapsed: boolean;
  appName: string;
  children: ReactNode;
};

/** AdminShell: persistent (collapsible) desktop sidebar, sheet navigation on small screens, header with breadcrumb and profile menu. */
export function AdminShell({ nav, user, initialCollapsed, appName, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    // Remembered per browser so the server renders the same width (no layout shift).
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/admin; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="flex min-h-svh w-full bg-muted/30">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-150 lg:flex",
          collapsed ? "w-16" : "w-60",
        )}
        aria-label="Admin"
      >
        <div className={cn("flex h-14 items-center border-b px-3", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <Link href="/admin" className="truncate text-sm font-semibold">
              {appName} <span className="font-normal text-muted-foreground">Admin</span>
            </Link>
          )}
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          </Button>
        </div>
        <SidebarNav nav={nav} collapsed={collapsed} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader nav={nav} user={user} appName={appName} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 outline-none sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarNav({ nav, collapsed, onNavigate }: { nav: NavGroup[]; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" onClick={onNavigate}>
      {nav.map((group) => (
        <div key={group.label} className="mb-4">
          {!collapsed && <p className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group.label}</p>}
          <ul role="list" className="grid gap-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActiveNav(pathname, item.href);
              const link = (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-md px-2 text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                    active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((segment, index) => ({
    href: `/${segments.slice(0, index + 1).join("/")}`,
    label: SEGMENT_LABELS[segment] ?? (index > 1 ? "Details" : segment),
  }));
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
            {index === crumbs.length - 1 ? (
              <span aria-current="page" className="truncate font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="truncate hover:text-foreground hover:underline">{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const ROLE_SHORT: Record<string, string> = { super_admin: "Super Admin", moderator: "Moderator", support_admin: "Support", analyst: "Analyst" };

function AdminHeader({ nav, user, appName }: { nav: NavGroup[]; user: ShellProps["user"]; appName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open admin menu">
            <Menu aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
          <SheetHeader className="border-b">
            <SheetTitle>{appName} Admin</SheetTitle>
            <SheetDescription className="sr-only">Admin navigation</SheetDescription>
          </SheetHeader>
          <SidebarNav nav={nav} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-2" aria-label={`Account menu for ${user.name}`}>
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-40 truncate text-sm sm:inline">{user.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="grid gap-1.5">
            <span className="truncate">{user.name}</span>
            <span className="flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <Badge key={r} variant="secondary">{ROLE_SHORT[r] ?? r}</Badge>
              ))}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/account"><UserRound aria-hidden /> My student account</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/marketplace"><Store aria-hidden /> Open marketplace</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action="/auth/signout" method="post">
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full"><LogOut aria-hidden /> Sign out</button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
