# Admin data boundaries

How data ownership, roles and permissions are enforced across the student marketplace and the admin
console. Companion documents: [`ADMIN_ROUTE_MAP.md`](ADMIN_ROUTE_MAP.md) (pages and redirects) and
[`ADMIN_API_CONTRACTS.md`](ADMIN_API_CONTRACTS.md) (HTTP endpoints).

## 1. Principles

1. **Authorization is decided on the server from trusted data.** Identity comes from the verified
   Supabase JWT (`getClaims()`); roles come from `public.user_roles`, which no client can write.
   Profile fields, JWT `user_metadata`, cookies, URL parameters and request bodies are never used to
   decide privileges.
2. **Every layer checks.** Page loaders, Server Actions, Route Handlers, domain services and the
   database each enforce access independently. Hiding a link or a button is not authorization.
3. **Privileged writes run inside the database.** Admin mutations call `SECURITY DEFINER` functions
   (`admin_*`) that are executable only by `service_role`. Each one takes the acting admin's id,
   re-checks that admin's permission *inside the database*, validates input, performs every step in
   one transaction and writes the audit record in that same transaction.
4. **Least privilege.** Four admin roles with a fixed permission set each. Private messages are
   never readable by default, even for super admins.
5. **Listings publish without approval.** Moderation is post-publication (flag, quarantine, remove,
   appeal). No permission or setting introduces a pre-approval queue.

## 2. Roles

| Role | Purpose |
|---|---|
| Visitor | Public pages only (landing, policies, help). No listing, profile or message data. |
| Unverified student | Signed in, email not yet confirmed. Can only verify, manage settings and read public pages. |
| Verified student | Browse, search, favourite, message, report, appeal. RLS: same-university data only. |
| Seller-enabled student | Verified student plus create/edit/pause/sell/delete **own** listings (self-service, AC-02). |
| Super Admin (`super_admin`) | Full console, configuration, role management, audit log, exports. |
| Moderator (`moderator`) | Listings, reports, appeals, community, account restrictions, reported-conversation investigation. |
| Support Admin (`support_admin`) | Read-only account and listing investigation, user contact lookup, report notes, deletion requests. |
| Analyst (`analyst`) | Aggregated analytics and de-identified exports only. No individual records and no actions. |

Admin roles are **additive to** a student account (staff are university members who sign in with the
same provider). A suspended account loses every admin permission immediately: `actor_has_permission()`
returns false while a suspension is active.

## 3. Permission matrix

Source of truth: `public.admin_role_permissions` (migration `20261029000005_admin_platform.sql`),
mirrored in `src/lib/auth/permissions.ts`. `tests/db/admin.test.ts` fails if they drift.

| Permission | Super Admin | Moderator | Support | Analyst | Grants |
|---|:-:|:-:|:-:|:-:|---|
| `overview.view` | ✓ | ✓ | ✓ | ✓ | Console access and the overview dashboard (sections are further gated) |
| `analytics.view` | ✓ | ✓ | | ✓ | Aggregated analytics |
| `analytics.export` | ✓ | | | ✓ | CSV of aggregated daily metrics |
| `users.view` | ✓ | ✓ | ✓ | | User directory, profiles, restrictions, history |
| `users.view_contact` | ✓ | | ✓ | | A user's account email and sign-in data (each view is audited) |
| `users.restrict` | ✓ | ✓ | | | Suspend, listing ban, messaging ban, lift restrictions |
| `users.export` | ✓ | | | | CSV of the user directory (no emails) |
| `listings.view` | ✓ | ✓ | ✓ | | All listings including hidden ones, images, declarations |
| `listings.moderate` | ✓ | ✓ | | | Quarantine, remove, restore (single and bulk, max 50) |
| `reports.view` | ✓ | ✓ | ✓ | | Report queue, evidence, internal notes |
| `reports.manage` | ✓ | ✓ | | | Status, priority, assignment, resolution |
| `reports.note` | ✓ | ✓ | ✓ | | Add internal notes |
| `reports.export` | ✓ | ✓ | | ✓ | De-identified CSV of report cases |
| `appeals.view` | ✓ | ✓ | ✓ | | Appeals queue |
| `appeals.resolve` | ✓ | ✓ | | | Uphold or overturn |
| `community.moderate` | ✓ | ✓ | | | Community posts and comments |
| `messages.investigate` | ✓ | ✓ | | | Open a reported conversation with a documented reason; restrict a conversation |
| `moderation.view` | ✓ | ✓ | | | Moderation rules, policy versions, automated decision log |
| `moderation.manage` | ✓ | | | | Create and activate policy versions (rules, thresholds, limits) |
| `config.view` | ✓ | ✓ | ✓ | ✓ | Read categories, university, settings |
| `categories.manage` | ✓ | | | | Create, edit, reorder, enable, disable and delete unused categories |
| `university.manage` | ✓ | | | | University details, email domains, meetup areas |
| `settings.manage` | ✓ | | | | Platform switches (pause sign-ups, publishing, community posting), admin session age |
| `roles.manage` | ✓ | | | | Grant and revoke admin roles; restrict other staff accounts |
| `audit.view` | ✓ | | | | Full audit trail |
| `audit.export` | ✓ | | | | CSV of the audit trail |
| `deletions.view` | ✓ | | ✓ | | Account deletion requests |
| `deletions.process` | ✓ | | | | Complete or cancel a deletion |

### Guard rails independent of role

| Rule | Enforced in |
|---|---|
| No one can change their own roles, restrict their own account or open a conversation they take part in | `admin_set_role`, `admin_restrict_user`, `admin_grant_conversation_access` |
| The last active Super Admin can't be revoked or deleted | `user_roles_guard` trigger |
| Only holders of `roles.manage` can restrict another staff account | `admin_restrict_user` |
| Roles can only be granted to verified, unsuspended accounts | `admin_set_role` |
| The last active email domain of the university can't be disabled (use "pause sign-ups" instead) | `admin_set_domain_active` |
| The last active category can't be disabled; categories in use can't be deleted or change slug or ticket type | `admin_save_category`, `admin_delete_category` |
| Bulk listing actions: at most 50 listings per request and 10 batches per hour | `admin_moderate_listings` |
| Rate limits on restrictions (60/h), report notes (120/h), conversation access (30/day), exports (20/h), role changes (20/h) | `admin_rate_limit()` |

## 4. Resource ownership and access

### Profiles

| Field group | Owner | Other verified students (same university) | Admin |
|---|---|---|---|
| `display_name`, `avatar_path`, `university_id`, `email_verified_at`, `seller_enabled_at`, `created_at` | read; update `display_name`, `avatar_path` only (column grants) | read | read with `users.view` |
| `profile_private` (email domain, contact phone, age/terms acceptance) | read; update `contact_phone` only | none | none from clients; shown on the user page via service role with `users.view` |
| Account email, last sign-in (`auth.users`) | own email via the session | none | `admin_user_contact()` with `users.view_contact`, audited as `user.contact_viewed` |
| `user_roles` | read own | none | read with `users.view` or `roles.manage`; write only via `admin_set_role` |
| `account_restrictions` (reason, expiry) | read own | none | read with `users.view`; write via `admin_restrict_user` / `admin_lift_restriction` |

Public seller information shown on listings is limited to display name, avatar, verification badge
and member-since date.

### Listings

- Create and edit only through the server action → `persist_listing()` (service role) after automated
  checks; the seller id comes from the session, never the payload. Publication is immediate when
  checks pass.
- Status changes by sellers only through `change_listing_status()` / `renew_listing()`, which enforce
  ownership and the lifecycle state machine. `seller_id`/`university_id` are immutable (trigger).
- Sellers can't write `moderation_*`, `published_at`, `expires_at` or timestamps (no table grants).
- Discovery shows `status = active` (optionally `on_hold`), `moderation_status = clear`, not expired,
  same university, seller not suspended, not blocked. Sold/expired are viewable by direct link and
  marked unavailable; drafts, quarantined (`limited`), blocked and removed listings are visible only
  to the seller and to admins with `listings.view`.
- Admin listing states map onto the schema as follows:

| Admin state | Schema |
|---|---|
| Live | `status = active`, `moderation_status = clear`, not expired |
| Reserved | `status = on_hold` |
| Sold | `status = sold` |
| Expired | `status = expired` or `expires_at` passed |
| Draft | `status = draft` (excluding auto-blocked) |
| Flagged | has at least one open/investigating report |
| Quarantined | `moderation_status = limited` (hidden pending review: automated, report threshold or admin) |
| Auto-blocked | `moderation_status = blocked` (high-confidence automated match before publication) |
| Removed | `moderation_status = removed` (safety team) or `status = removed` (seller) |

### Conversations and messages

- Only the buyer and seller can read a conversation or its messages (RLS), and only they can post
  (`can_message()`: participant, verified, not blocked, no messaging ban, conversation not restricted).
- No admin role has RLS access to `messages`. Investigation goes through
  `admin_grant_conversation_access()` (requires `messages.investigate`, a written reason of at least
  10 characters, optionally a linked report, and the investigator must not be a participant). It
  creates a 30-minute grant and an audit record. `admin_conversation_messages()` returns messages only
  while that admin holds a valid grant, and every read is audited.
- Conversation metadata search (participants, listing, counts, linked reports, no message text) is
  available with `messages.investigate`.
- `admin_restrict_conversation()` stops new messages in a conversation (participants see that it's
  restricted) and is audited.

### Reports and moderation

- Students submit reports through `submit_report()` (rate-limited, de-duplicated). They read their own
  cases only through `my_report_cases()`, which returns case number, reason, status, the user-visible
  resolution summary and timestamps, and never priority, assignee, evidence handling or notes.
- Students have **no** direct table access to `reports`, `report_notes`, `moderation_events`,
  `admin_audit_logs`, `conversation_access_grants`, `platform_settings` or `admin_role_permissions`.
- Reported users never learn who reported them.
- `report_notes` are internal: readable with `reports.view`, append-only.

### University configuration

Domains, verification-related settings, meetup areas and university details change only through
`admin_*` functions requiring `university.manage`, with before/after values in the audit log. The
generic email-provider blocklist is enforced on add. Verification is **email confirmation of a
university-domain address** (link or 6-digit code); this proves control of the mailbox, not current
enrolment, and the console says so.

### Analytics

`admin_overview()` and `admin_analytics()` return aggregates only. Analysts never receive individual
records. Search analytics come from first-party `search_submitted` events (no query text except
letters-only zero-result terms, already minimised at collection).

### Audit logs

- Written only by `admin_write_audit()` (service role) inside the same transaction as the action.
- Append-only: `UPDATE`/`DELETE`/`TRUNCATE` revoked from `service_role`, and the `append_only_guard`
  trigger rejects any change except the `ON DELETE SET NULL` of `actor_id` when an account is deleted.
- Never contain passwords, tokens, keys, message bodies or email addresses. Before/after values are
  limited to the fields that changed.
- Denied attempts by staff (missing permission) are recorded with `outcome = 'denied'`.

## 5. Database access policy matrix

`R` = SELECT via RLS policy, `W` = client write, `—` = no client access. All writes not listed go through
`service_role` (server only) or `SECURITY DEFINER` RPCs.

| Table | anon | Student (own) | Student (others, same university) | Admin (permission) | Client writes |
|---|---|---|---|---|---|
| `universities`, `categories`, `university_domains` | R active | R active | R active | R all (`is_staff`) | — |
| `meetup_areas` | — | R active, own university | R | R all | — |
| `profiles` | — | R | R if verified | R `users.view` | update `display_name`, `avatar_path` (own) |
| `profile_private` | — | R | — | — | update `contact_phone` (own) |
| `user_roles` | — | R | — | R `users.view` / `roles.manage` | — |
| `account_restrictions` | — | R | — | R `users.view` | — |
| `policy_versions` | — | — | — | R `moderation.view` | — |
| `listings` | — | R | R discoverable/sold/expired | R `listings.view` | — (RPCs) |
| `listing_images` | — | R | R if listing visible | R `listings.view` | — |
| `listing_declarations` | — | R | — | R `listings.view` | — |
| `favourites` | — | R/W own | — | — | insert/delete own |
| `conversations` | — | R participant | — | — | — (RPC) |
| `messages` | — | R participant | — | — (grant-based RPC only) | insert as participant via `can_message()` |
| `blocks` | — | R/W own | — | — | insert/delete own |
| `reports` | — | — (`my_report_cases()`) | — | R `reports.view` | — (RPC) |
| `report_notes` | — | — | — | R `reports.view` | — |
| `appeals` | — | R | — | R `appeals.view` | — (RPC) |
| `moderation_events` | — | — | — | R `listings.view`, `users.view` or `moderation.view` | — (append-only) |
| `admin_audit_logs` | — | — | — | R `audit.view` | — (append-only) |
| `account_deletion_requests` | — | R | — | R `deletions.view` | — (RPC) |
| `analytics_events` | — | — | — | R `analytics.view` | — |
| `forum_posts`, `forum_comments` | — | R | R visible | R `community.moderate` | — (server) |
| `conversation_access_grants`, `platform_settings`, `admin_role_permissions` | — | — | — | — (service role via `admin_*`) | — |

### Storage

| Bucket | Read | Write |
|---|---|---|
| `listing-images` (private) | Owner folder, or any object referenced by a listing the caller can see under `listings`/`listing_images` RLS (so admins with `listings.view` can see hidden listings' photos). Served by short-lived signed URLs. | Insert into own folder when `can_sell()`; delete own. Uploads only via `POST /api/uploads` (re-encoded, EXIF stripped). |
| `avatars` (private) | Verified students | Insert into own folder when verified; delete own |

### Function execution

| Function group | anon | authenticated | service_role |
|---|:-:|:-:|:-:|
| `check_email_domain`, `is_staff` (policy helper) | ✓ | ✓ | ✓ |
| Student RPCs (`start_conversation`, `submit_report`, `my_report_cases`, ...) | | ✓ | ✓ |
| Permission-checked admin reads (`admin_overview`, `admin_analytics`, `admin_list_*`, `has_permission`) | | ✓ (raise `FORBIDDEN` without permission) | ✓ |
| Admin mutations and sensitive reads (`admin_moderate_listings`, `admin_restrict_user`, `admin_set_role`, `admin_user_contact`, `admin_conversation_messages`, ...) | | | ✓ (take `p_actor`, re-check permission) |
| `persist_listing`, `expire_stale_listings`, trigger functions | | | ✓ |

## 6. Sensitive actions and audit events

| Action | Audit `action` | Extra requirement |
|---|---|---|
| Suspend / ban / lift | `user.restrict.<kind>`, `user.restriction_lifted` | Reason shown to the user; confirmation dialog |
| View account email | `user.contact_viewed` | `users.view_contact` |
| Quarantine / remove / restore listing | `listing.quarantine` / `listing.remove` / `listing.restore` | Reason; confirmation; bulk adds `listing.bulk_<action>` |
| Report status, priority, assignment, note | `report.<status>`, `report.priority`, `report.assigned`, `report.note_added` | Closing requires a resolution code and a summary for the reporter |
| Appeal decision | `appeal.upheld` / `appeal.overturned` | Overturn reverses the original action atomically |
| Conversation access / restriction | `conversation.access_granted`, `conversation.messages_viewed`, `conversation.restricted`, `conversation.unrestricted` | Documented reason |
| Policy version / activation | `policy.version_created`, `policy.activated` | Zod-validated config; rollback by re-activating |
| Category changes | `category.created`, `category.updated`, `category.reordered`, `category.deleted` | Destructive changes confirmed |
| University, domain, meetup area changes | `university.updated`, `domain.added`, `domain.activated`/`deactivated`, `meetup_area.*` | `university.manage` |
| Platform settings | `setting.updated` | `settings.manage` |
| Role grant / revoke | `role.granted`, `role.revoked` | `roles.manage`; reason; typed confirmation |
| Exports | `export.<dataset>` | Dataset permission; row count and filters recorded |
| Deletion request | `account_deletion.complete` / `.cancel` | `deletions.process` |
| Console sign-in | `admin.signed_in` | |
| Denied attempt | `<action>` with `outcome = denied` | |

## 7. Sessions

- The console reuses Supabase Auth. `/admin/login` signs in with the same provider, then admits only
  accounts holding `overview.view`; any other account is signed out again with a generic message (no
  account enumeration).
- **Session age:** console pages and admin APIs require that the session's last interactive
  authentication (`amr` timestamp in the verified JWT) is within `admin_session_max_hours` (platform
  setting, default 12 h). Older sessions are sent to `/admin/login?reason=expired`.
- Suspension or role revocation takes effect on the next request (roles are read per request, not
  cached in the token).
- Admin responses are `Cache-Control: private, no-store`; admin pages are dynamic and never cached
  across users.
