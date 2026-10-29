# Admin API contracts

HTTP endpoints under `/api/admin/*`. The console UI itself uses Server Actions; these Route Handlers
expose the **same server-only services** for scripted operations, exports and integrations. Both
paths run the same permission checks and the same audited database functions.

## 1. Conventions

| Topic | Contract |
|---|---|
| Authentication | Supabase session cookie (same as the console). No API keys. |
| Authorization | Every handler calls `withAdmin(permission, handler)`: signed out → `401`; not staff, suspended or missing permission → `403` (staff denials are audited); stale admin session → `401` with `code: "SESSION_EXPIRED"`. |
| CSRF | Mutating methods require `Content-Type: application/json` and an `Origin` header matching the site origin; otherwise `403 CSRF_REJECTED`. |
| Validation | Zod for path params (UUIDs), query strings and bodies. Unknown body fields are rejected (`strict()`), which prevents mass assignment. Invalid input → `400` with `issues`. |
| IDOR | Every resource is loaded by id inside a permission-checked service; there are no owner-scoped admin shortcuts to bypass. |
| Responses | JSON, `Cache-Control: private, no-store`. Success: `{ "data": ... }` (lists add `"page"`). Error: `{ "error": { "code": "...", "message": "..." } }`. |
| Pagination | `page` (≥1, default 1), `pageSize` (10–100, default 25). Response `page: { page, pageSize, total }`. |
| Sorting | `sort=<field>&dir=asc|desc`, field from a per-endpoint allowlist. |
| Rate limits | Enforced in the database per actor (see ADMIN_DATA_BOUNDARIES.md §3) → `429 RATE_LIMITED`. |
| CSV | `format=csv` where listed. `text/csv; charset=utf-8`, attachment filename, values starting with `= + - @` are prefixed with `'` (formula-injection guard). Max 10,000 rows. Every export is audited. |

### Error codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | Validation failed (`issues` lists paths) |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED` | No session / admin session too old |
| 403 | `FORBIDDEN`, `CSRF_REJECTED` | Missing permission / failed origin check |
| 404 | `NOT_FOUND` | Unknown id |
| 409 | `CONFLICT` | Guard rail (e.g. `LAST_SUPER_ADMIN`, `CATEGORY_IN_USE`, `CANNOT_TARGET_SELF`) — `message` explains |
| 429 | `RATE_LIMITED` | Admin rate limit reached |
| 500 | `INTERNAL` | Unexpected failure (details logged server-side only) |

## 2. Endpoints

| Method & path | Permission | Request | Response `data` |
|---|---|---|---|
| `GET /api/admin/overview` | `overview.view` | `from`, `to` (ISO dates, ≤ 366 days) | Aggregate counts, daily series, category distribution (`admin_overview`) |
| `GET /api/admin/users` | `users.view` | `q`, `status` (`all\|verified\|unverified\|restricted\|suspended\|staff`), `sort` (`created_at\|display_name\|listings\|reports`), `dir`, `page`, `pageSize`, `format=csv` (`users.export`) | User rows: id, display name, university, verified, seller, joined, active restriction kinds, roles, listing and open-report counts |
| `GET /api/admin/users/[id]` | `users.view` | — | Profile, restrictions, recent listings, reports against, moderation history |
| `POST /api/admin/users/[id]` | `users.restrict` | `{ "action": "restrict", "kind": "suspension\|listing_ban\|messaging_ban", "reason": string(3–1000), "durationDays": 0–3650, "reportId"?: uuid }` or `{ "action": "lift", "restrictionId": uuid, "reason": string }` | `{ restrictionId }` / `{}` |
| `GET /api/admin/listings` | `listings.view` | `q`, `state` (`all\|live\|reserved\|sold\|expired\|draft\|flagged\|quarantined\|blocked\|removed`), `category` (slug), `signal` (reason code), `sort` (`created_at\|updated_at\|price\|reports`), `dir`, `page`, `pageSize` | Listing rows with admin state, seller, category, open reports, reason codes |
| `POST /api/admin/listings` | `listings.moderate` | `{ "action": "quarantine\|remove\|restore", "listingIds": uuid[1–50], "reason": string(3–1000), "confirm": true }` | `{ updated: number }` |
| `GET /api/admin/listings/[id]` | `listings.view` | — | Listing, images (signed URLs), declarations, moderation history, reports |
| `PATCH /api/admin/listings/[id]` | `listings.moderate` | `{ "action": "quarantine\|remove\|restore", "reason": string, "reportId"?: uuid }` | `{ updated: number }` |
| `GET /api/admin/reports` | `reports.view` (`reports.export` for CSV) | `status`, `priority` (1–4), `severity` (1–3), `reason`, `target`, `assignee` (`me\|unassigned\|<uuid>`), `q` (case number), `sort` (`created_at\|priority\|severity\|updated_at`), `dir`, `page`, `pageSize`, `format=csv` | Report rows (CSV is de-identified: no names, details or evidence) |
| `GET /api/admin/reports/[id]` | `reports.view` | — | Report, evidence, notes, related reports, action history |
| `PATCH /api/admin/reports/[id]` | `reports.manage` | `{ "status"?, "priority"?: 1–4, "assignedTo"?: uuid\|null, "resolutionCode"?, "summary"?: string }` | `{}` |
| `POST /api/admin/reports/[id]` | `reports.note` | `{ "note": string(2–2000) }` | `{ noteId }` |
| `GET /api/admin/moderation/rules` | `moderation.view` | — | Active policy, versions, built-in detectors, AI provider status (`not_configured`) |
| `POST /api/admin/moderation/rules` | `moderation.manage` | `{ "config": PolicyConfig, "note": string(3–500), "activate": boolean }` | `{ version }` |
| `GET /api/admin/categories` | `config.view` | — | Categories with listing counts |
| `POST /api/admin/categories` | `categories.manage` | `{ "slug", "name", "description"?, "icon", "isTicket", "isActive" }` | `{ id }` |
| `PATCH /api/admin/categories` | `categories.manage` | `{ "id", ...fields }` or `{ "order": uuid[] }` | `{}` |
| `GET /api/admin/universities` | `config.view` | — | University, domains, meetup areas, verification overview |
| `PATCH /api/admin/universities` | `university.manage` | `{ "action": "update", "universityId", "name", "shortName"?, "city"? }`, `{ "action": "add_domain", "universityId", "domain", "note"? }`, `{ "action": "set_domain_active", "domainId", "active", "reason" }` | `{}` |
| `GET /api/admin/messages` | `messages.investigate` | `q` (report case `R-000123`, conversation id or user id), `page`, `pageSize` | Conversation metadata only (no message text) |
| `GET /api/admin/analytics` | `analytics.view` (`analytics.export` for CSV) | `from`, `to`, `format=csv` | `admin_analytics` aggregates / daily CSV |
| `GET /api/admin/audit-logs` | `audit.view` (`audit.export` for CSV) | `action` (prefix), `actor` (uuid), `targetType`, `targetId`, `outcome`, `from`, `to`, `page`, `pageSize`, `format=csv` | Audit rows |
| `GET /api/admin/roles` | `roles.manage` | — | Staff accounts with roles, permission matrix |
| `POST /api/admin/roles` | `roles.manage` | `{ "userId", "role", "grant": boolean, "reason": string }` | `{}` |
| `GET /api/admin/settings` | `config.view` | — | Platform settings |
| `PATCH /api/admin/settings` | `settings.manage` | `{ "key", "value", "reason" }` | `{}` |

Message content is **not** exposed over HTTP; reading a conversation requires the interactive grant
flow on `/admin/messages/[conversationId]`.
