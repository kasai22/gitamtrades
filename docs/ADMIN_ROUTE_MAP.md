# Route map

Routes, layouts, access requirements and redirects for the student marketplace and the admin
console. Permissions are defined in [`ADMIN_DATA_BOUNDARIES.md`](ADMIN_DATA_BOUNDARIES.md).

## 1. Layout structure

Route groups separate the two applications without changing any public URL.

```
src/app/
  layout.tsx                 html/body, fonts, skip link, toaster (no navigation chrome)
  not-found.tsx, global error handling
  (site)/                    student marketplace
    layout.tsx               SiteHeader + <main> + SiteFooter
    loading.tsx, error.tsx
    (auth)/                  login, signup, verify-email, forgot/reset password
    page.tsx, marketplace/, search/, categories/, listings/, sell/, account/, messages/, community/,
    appeals/, terms/, privacy/, policies/, safety/, help/, grievance/
  auth/                      route handlers: confirm, callback, signout (no UI)
  admin/
    layout.tsx               admin metadata only (static; no session read)
    loading.tsx
    login/page.tsx           admin sign-in (public)
    (console)/
      layout.tsx             requireAdmin() inside <Suspense>, sidebar shell, header, breadcrumb
      page.tsx and every console page below
  api/
    uploads/route.ts         student uploads
    admin/**/route.ts        admin HTTP API (see ADMIN_API_CONTRACTS.md)
```

Layouts don't re-run on client-side navigation, so **every console page calls `requirePermission()`
itself**. The console layout's check only decides whether chrome renders.

## 2. Student application

| Route | Access | Unauthenticated | Notes |
|---|---|---|---|
| `/` | Public | Landing page | Signed-in students see their home feed |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Public | — | |
| `/verify-email` | Signed in, unverified | `/login` | |
| `/terms`, `/privacy`, `/policies/*`, `/safety`, `/help`, `/grievance` | Public | — | |
| `/marketplace`, `/search`, `/categories/[slug]` | Verified student | `/login?next=` | Unverified → `/verify-email` |
| `/listings/[id]` | Verified student (or seller / admin) | `/login?next=` | Non-discoverable listings 404 for others |
| `/sell`, `/sell/[id]/edit` | Seller-enabled, no listing ban; edit = owner only | `/login?next=` | Self-service; publishes after automated checks |
| `/account`, `/account/listings`, `/account/settings`, `/account/favourites`, `/account/cases` | Signed in (own data) | `/login?next=` | Suspended users can still view their account and appeal |
| `/messages`, `/messages/[conversationId]` | Verified participant | `/login?next=` | Non-participants get 404 |
| `/community/**` | Verified student | `/login?next=` | |
| `/appeals/new` | Signed in, with something to appeal | `/login?next=` | |

## 3. Admin console

All console routes: signed out → `/admin/login?next=<path>`; signed in without any admin role (or
suspended) → **404** (the console isn't advertised); session older than the configured maximum →
`/admin/login?reason=expired&next=<path>`; signed in as staff but missing the page permission →
`/admin?denied=<permission>` with an explanatory notice.

| Route | Page permission | Actions on the page (each re-checked server-side) |
|---|---|---|
| `/admin/login` | Public | Sign in (admits staff only) |
| `/admin` | `overview.view` | Quick links; sections gated by `users.view`, `listings.view`, `reports.view`, `moderation.view` |
| `/admin/users` | `users.view` | Search (name, ID; exact email with `users.view_contact`), filter, sort, paginate; export (`users.export`) |
| `/admin/users/[id]` | `users.view` | Restrict / lift (`users.restrict`), view email (`users.view_contact`), roles link (`roles.manage`) |
| `/admin/listings` | `listings.view` | Filter by admin state/category/signal, bulk quarantine/remove/restore (`listings.moderate`) |
| `/admin/listings/[id]` | `listings.view` | Quarantine / remove / restore (`listings.moderate`) |
| `/admin/reports` | `reports.view` | Filter by status/priority/severity/reason/target/assignee; export (`reports.export`) |
| `/admin/reports/[id]` | `reports.view` | Assign, prioritise, change status, resolve (`reports.manage`); notes (`reports.note`); take action (`listings.moderate`, `users.restrict`, `community.moderate`, `messages.investigate`) |
| `/admin/appeals` | `appeals.view` | Uphold / overturn (`appeals.resolve`) |
| `/admin/community` | `community.moderate` | Remove / restore / lock / pin |
| `/admin/moderation` | `moderation.view` | Edit rules and thresholds, activate/rollback versions (`moderation.manage`); automated decision log |
| `/admin/categories` | `config.view` | Create, edit, reorder, enable/disable, delete unused (`categories.manage`) |
| `/admin/universities` | `config.view` | University details, domains, meetup areas (`university.manage`); verification overview |
| `/admin/messages` | `messages.investigate` | Search conversations by report case, conversation ID or user ID (metadata only) |
| `/admin/messages/[conversationId]` | `messages.investigate` | Request access with a documented reason, read while the grant is valid, restrict the conversation |
| `/admin/analytics` | `analytics.view` | Date range; export (`analytics.export`) |
| `/admin/audit-logs` | `audit.view` | Filter, paginate; export (`audit.export`) |
| `/admin/settings` | `config.view` | Platform switches and session age (`settings.manage`) |
| `/admin/roles` | `roles.manage` | Grant / revoke roles; permission matrix |
| `/admin/deletion-requests` | `deletions.view` | Complete / cancel (`deletions.process`) |

### Redirects

| From | To | Reason |
|---|---|---|
| `/admin/audit` | `/admin/audit-logs` | Renamed |
| `/admin/policy` | `/admin/moderation` | Policy configuration split into Moderation, Universities and Settings |
| `/account/messages` | `/messages` | Existing |

## 4. Proxy (`src/proxy.ts`)

The proxy only refreshes the Supabase session and performs **optimistic** redirects for signed-out
visitors (`/admin/**` → `/admin/login`, student routes → `/login`). It never grants access.
`/api/admin/**` is not redirected; handlers return `401`/`403` JSON.

## 5. Caching

`Cache-Control: private, no-store` is set for `/admin/**`, `/api/admin/**` and all personal student
routes in `next.config.ts`. Console pages read the session at request time (inside `<Suspense>`), so
nothing user-specific is prerendered into a shared static shell.
