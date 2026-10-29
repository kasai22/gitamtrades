/**
 * Admin roles and permissions. Mirrors public.admin_role_permissions (migration
 * 20261029000005_admin_platform.sql); tests/db/admin.test.ts fails if the two drift.
 * This module is pure so the client can use it for display, but authorization is always decided on
 * the server (src/lib/auth/admin.ts) and again inside the database (admin_assert / has_permission).
 */
export const ADMIN_ROLES = ["super_admin", "moderator", "support_admin", "analyst"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSIONS = [
  "overview.view",
  "analytics.view",
  "analytics.export",
  "users.view",
  "users.view_contact",
  "users.restrict",
  "users.export",
  "listings.view",
  "listings.moderate",
  "reports.view",
  "reports.manage",
  "reports.note",
  "reports.export",
  "appeals.view",
  "appeals.resolve",
  "community.moderate",
  "messages.investigate",
  "moderation.view",
  "moderation.manage",
  "config.view",
  "categories.manage",
  "university.manage",
  "settings.manage",
  "roles.manage",
  "audit.view",
  "audit.export",
  "deletions.view",
  "deletions.process",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  moderator: [
    "overview.view",
    "analytics.view",
    "users.view",
    "users.restrict",
    "listings.view",
    "listings.moderate",
    "reports.view",
    "reports.manage",
    "reports.note",
    "reports.export",
    "appeals.view",
    "appeals.resolve",
    "community.moderate",
    "messages.investigate",
    "moderation.view",
    "config.view",
  ],
  support_admin: [
    "overview.view",
    "users.view",
    "users.view_contact",
    "listings.view",
    "reports.view",
    "reports.note",
    "appeals.view",
    "config.view",
    "deletions.view",
  ],
  analyst: ["overview.view", "analytics.view", "analytics.export", "reports.export", "config.view"],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  moderator: "Moderator",
  support_admin: "Support Admin",
  analyst: "Analyst",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: "Full console access, configuration, role management and the audit log.",
  moderator: "Listings, reports, appeals, community and account restrictions. Can investigate reported conversations.",
  support_admin: "Read-only account and listing investigation, account email lookup, report notes and deletion requests.",
  analyst: "Aggregated analytics and de-identified exports. No individual records and no actions.",
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "overview.view": "Open the console and overview",
  "analytics.view": "View aggregated analytics",
  "analytics.export": "Export aggregated analytics",
  "users.view": "View user accounts and history",
  "users.view_contact": "View a user's account email (audited)",
  "users.restrict": "Suspend, ban and lift restrictions",
  "users.export": "Export the user directory",
  "listings.view": "View all listings, including hidden ones",
  "listings.moderate": "Quarantine, remove and restore listings",
  "reports.view": "View reports, evidence and notes",
  "reports.manage": "Assign, prioritise and resolve reports",
  "reports.note": "Add internal report notes",
  "reports.export": "Export de-identified report cases",
  "appeals.view": "View appeals",
  "appeals.resolve": "Uphold or overturn appeals",
  "community.moderate": "Moderate community posts and comments",
  "messages.investigate": "Investigate reported conversations (documented, audited)",
  "moderation.view": "View moderation rules and decisions",
  "moderation.manage": "Change moderation rules and thresholds",
  "config.view": "View categories, university and settings",
  "categories.manage": "Manage categories",
  "university.manage": "Manage university, email domains and meetup areas",
  "settings.manage": "Change platform settings",
  "roles.manage": "Grant and revoke admin roles",
  "audit.view": "View the audit log",
  "audit.export": "Export the audit log",
  "deletions.view": "View account deletion requests",
  "deletions.process": "Complete or cancel account deletions",
};

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Union of the permissions granted by the given roles. Suspended accounts must pass `[]`. */
export function permissionsFor(roles: readonly string[]): Permission[] {
  const granted = new Set<Permission>();
  for (const role of roles) {
    if (isAdminRole(role)) for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  }
  return PERMISSIONS.filter((p) => granted.has(p));
}

export function hasPermission(subject: { permissions: readonly Permission[] } | null | undefined, permission: Permission) {
  return Boolean(subject?.permissions.includes(permission));
}
