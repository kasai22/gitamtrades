import type { Permission } from "@/lib/auth/permissions";

/**
 * Console navigation. Items are filtered by permission on the server so staff only see what they
 * can open. This is convenience, not security: every page and action authorizes independently.
 */
export type NavIcon =
  | "overview" | "reports" | "listings" | "users" | "appeals" | "community" | "messages" | "moderation"
  | "categories" | "universities" | "analytics" | "audit" | "settings" | "roles" | "deletions";

export type NavItem = { href: string; label: string; icon: NavIcon; permission: Permission };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/admin", label: "Overview", icon: "overview", permission: "overview.view" },
      { href: "/admin/reports", label: "Reports", icon: "reports", permission: "reports.view" },
      { href: "/admin/listings", label: "Listings", icon: "listings", permission: "listings.view" },
      { href: "/admin/users", label: "Users", icon: "users", permission: "users.view" },
      { href: "/admin/appeals", label: "Appeals", icon: "appeals", permission: "appeals.view" },
      { href: "/admin/community", label: "Community", icon: "community", permission: "community.moderate" },
      { href: "/admin/messages", label: "Conversations", icon: "messages", permission: "messages.investigate" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: "analytics", permission: "analytics.view" },
      { href: "/admin/audit-logs", label: "Audit log", icon: "audit", permission: "audit.view" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/admin/moderation", label: "Moderation rules", icon: "moderation", permission: "moderation.view" },
      { href: "/admin/categories", label: "Categories", icon: "categories", permission: "config.view" },
      { href: "/admin/universities", label: "University", icon: "universities", permission: "config.view" },
      { href: "/admin/settings", label: "Settings", icon: "settings", permission: "config.view" },
      { href: "/admin/roles", label: "Roles & access", icon: "roles", permission: "roles.manage" },
      { href: "/admin/deletion-requests", label: "Deletion requests", icon: "deletions", permission: "deletions.view" },
    ],
  },
];

export function navFor(permissions: readonly Permission[]): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => permissions.includes(i.permission)) })).filter((g) => g.items.length > 0);
}

/** Breadcrumb labels for console path segments. */
export const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  reports: "Reports",
  listings: "Listings",
  users: "Users",
  appeals: "Appeals",
  community: "Community",
  messages: "Conversations",
  analytics: "Analytics",
  "audit-logs": "Audit log",
  moderation: "Moderation rules",
  categories: "Categories",
  universities: "University",
  settings: "Settings",
  roles: "Roles & access",
  "deletion-requests": "Deletion requests",
};

export function isActiveNav(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
