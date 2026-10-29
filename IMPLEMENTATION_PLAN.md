# Implementation Plan — University Student Marketplace

Source of truth: [`PRD.md`](PRD.md) (v1.0, 28 Oct 2026). Requirement-level status lives in [`REQUIREMENTS_TRACEABILITY.md`](REQUIREMENTS_TRACEABILITY.md).

## 1. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict | `cacheComponents` + `partialPrefetching` enabled (scaffold default, mandatory in the next major). Runtime data (cookies/session) is always read inside a `<Suspense>`/`loading.tsx` boundary. Auth checks run in pages/actions, never only in layouts. `proxy.ts` (formerly middleware) refreshes the Supabase session and performs optimistic redirects only. |
| UI | Tailwind CSS v4, shadcn/ui (radix-nova preset, Radix primitives), Lucide, Sonner | Design tokens in `src/app/globals.css`. Shared primitives in `src/components/ui`, product components in `src/components/*` and `src/features/*/components`. |
| Data | Supabase Postgres | Migrations in `supabase/migrations`. RLS on every table, explicit grants (we revoke defaults from `anon`/`authenticated` and grant only what is needed). |
| Auth | Supabase Auth (email + password, email confirmation required) | Domain allowlist enforced **in the database** (`auth.users` insert trigger) and pre-checked in the server action for a clear message. Verification by link (`/auth/confirm`, token-hash flow) or 6-digit code (`verifyOtp`). |
| Storage | Supabase Storage, **private** buckets `listing-images`, `avatars` | Uploads go through `POST /api/uploads` → magic-byte sniffing, size limits, sharp re-encode to WebP (strips EXIF/GPS), thumbnail generation, QR-code detection (jsQR). Images are served via short-lived signed URLs; storage RLS only lets a user read an object if they can see the listing that references it. |
| Server ops | Server Actions (mutations) + Route Handlers (uploads, auth callbacks, sign-out) | Validation with Zod at every boundary. |
| Moderation | Deterministic, versioned rules engine in TypeScript (`src/features/moderation/engine.ts`) + DB-side report thresholds | Provider-independent `ImageSafetyProvider` interface; only QR detection is implemented. No AI moderation is claimed. |
| Tests | Vitest (unit + **PGlite** database tests that apply the real migrations against a stubbed Supabase `auth`/`storage` schema), Playwright (E2E) | PGlite lets RLS, triggers and RPCs be verified without Docker. Full E2E requires a running Supabase stack. |

### Write paths (security model)

1. **User-scoped client (RLS enforced)** — all reads; messages, favourites, blocks; RPCs `start_conversation`, `change_listing_status`, `renew_listing`, `submit_report`, `submit_appeal`, `enable_selling`, `request_account_deletion`, `mark_conversation_read`.
2. **Service-role client (server only, `import "server-only"`)** — listing create/edit via the single atomic `persist_listing()` function (so moderation cannot be bypassed by calling PostgREST directly), image metadata rows, admin enforcement actions, audit logs, analytics events. Every call is preceded by an explicit session + ownership/role check in the data-access layer.
3. **Database guarantees independent of the app** — domain allowlist, 18+/terms metadata required at sign-up, listing state machine, seller-id immutability, rate limits (listings/day, messages/minute/day, conversations/day, reports/day), block enforcement, report de-duplication and auto-limit thresholds.

## 2. Domain model

| Table | Purpose |
|---|---|
| `universities`, `university_domains`, `meetup_areas` | Multi-university-ready configuration; one active university at launch. Domains are the identity gate (A-02). Meetup areas are general campus places (A-03). |
| `categories` | D-04 launch categories, `is_ticket` flag for ticket-specific rules. |
| `profiles` | Visible-to-campus profile (display name, avatar, university, verification + seller timestamps). |
| `profile_private` | Owner-only data: email domain, saved contact number, age/terms/seller-terms acceptance. |
| `user_roles` | `super_admin` / `moderator` / `support_admin` / `analyst`. Never writable by clients; changed only by `admin_set_role()`. |
| `admin_role_permissions` | Permission catalogue per role (mirrored in `src/lib/auth/permissions.ts`, parity-tested). |
| `report_notes` | Internal, append-only report notes (staff with `reports.view`). |
| `conversation_access_grants` | Documented, 30-minute, per-admin grants to read a reported conversation. |
| `platform_settings` | Enforced switches: pause sign-ups / publishing / community posting; admin session age. |
| `account_restrictions` | Suspension / listing ban / messaging ban with optional expiry — the single source of account status. |
| `policy_versions` | Versioned moderation & rate-limit configuration (JSON validated by Zod). Exactly one active version; rollback = re-activate an older version. |
| `listings` | Seller-owned listing with lifecycle `status` (draft, active, on_hold, sold, expired, removed) and orthogonal `moderation_status` (unchecked, clear, limited, blocked, removed) + `moderation_source` + user-facing `moderation_reasons`. Full-text `search_vector`. |
| `listing_images` | Processed image metadata; created by the upload handler (unattached), attached on save. Stores content hash (duplicate-image signal) and QR flag. |
| `listing_declarations` | LIST-06 declaration history with policy version + timestamp. |
| `favourites` | DISC-05. |
| `conversations` | One per (listing, buyer); buyer/seller read markers; last-message preview. |
| `messages` | `text`, `contact_share`, `system`; idempotent by `(conversation_id, client_id)`. |
| `blocks` | CHAT-03. |
| `reports` | Case number `R-000001`, target (listing/user/message), reason, severity, status, evidence snapshot, user-visible resolution summary. |
| `appeals` | Case number `A-000001`, against a listing decision or an account restriction. |
| `moderation_events` | Automated + admin enforcement trail: action, source, reason codes, rule/model version, actor. |
| `admin_audit_logs` | Every privileged action, including viewing reported message content and policy/domain changes (before/after). |
| `account_deletion_requests` | AUTH-04 deletion request workflow. |
| `analytics_events` | AN-01 first-party event log; whitelisted names and property schemas, no emails, message bodies or contact data. |

### Listing lifecycle (PRD §8.3)

Seller transitions (enforced by `listing_transition_allowed()` in SQL and mirrored in `src/features/listings/status.ts`; a DB test asserts they agree):

```
active  → on_hold | sold | removed
on_hold → active | sold | removed
sold    → active (explicit relist) | removed
expired → active (renew) | removed
draft   → removed
draft   → active    only through publish + automated checks (persist_listing)
```

`active/on_hold` listings whose `expires_at` has passed are treated as `expired` everywhere (discovery filters on `expires_at`, the status RPC normalises it); `expire_stale_listings()` can be scheduled with `pg_cron` to persist the state.

Moderation outcomes on publish: **allow** → `active` + `clear`; **limit** (ambiguous signal) → `active` + `limited` (hidden from others, seller told what to clarify, appears in admin queue); **block** (high confidence) → `draft` + `blocked` with specific reasons and an appeal link. Edits cannot clear a restriction that came from user reports or an admin.

### Discovery visibility

`status ∈ {active}` (optionally `on_hold`), `moderation_status = clear`, not expired, same university, seller not suspended, seller not blocked by the viewer. Sold/expired listings remain viewable by direct link with a clear "no longer available" state but cannot be contacted.

## 3. Routes

| Area | Routes |
|---|---|
| Public | `/` (landing / signed-in home), `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/auth/confirm`, `/auth/callback`, `/auth/signout`, `/terms`, `/privacy`, `/policies/prohibited-items`, `/safety`, `/help` |
| Discovery | `/marketplace`, `/search`, `/categories/[slug]`, `/listings/[id]` |
| Selling | `/sell`, `/sell/[id]/edit`, `/account/listings`; the owner's view of `/listings/[id]` shows the moderation explanation and status controls |
| Account | `/account`, `/account/favourites`, `/account/settings`, `/account/cases`, `/account/messages` → `/messages` |
| Messaging | `/messages`, `/messages/[conversationId]` |
| Safety | `/appeals/new` |
| Admin | `/admin/login` (public) and the console group: `/admin`, `/admin/users[/id]`, `/admin/listings[/id]`, `/admin/reports[/id]`, `/admin/appeals`, `/admin/community`, `/admin/messages[/conversationId]`, `/admin/moderation`, `/admin/categories`, `/admin/universities`, `/admin/analytics`, `/admin/audit-logs`, `/admin/settings`, `/admin/roles`, `/admin/deletion-requests`. See `docs/ADMIN_ROUTE_MAP.md`. |
| API | `POST /api/uploads` (listing images, avatars); `/api/admin/*` (see `docs/ADMIN_API_CONTRACTS.md`) |

## 4. Implementation sequence

| Phase | Scope | Status |
|---|---|---|
| 0 | Repo audit, PRD transcription, plan, traceability, schema design | Done |
| 1 | Next.js/Tailwind/shadcn foundation, env validation, Supabase clients, migrations + RLS, PGlite DB test harness, design tokens, app shell | Done |
| 2 | Sign-up/in, verification (link + code), password reset, session handling, domain eligibility, profile, seller enablement | Done |
| 3 | Discovery (home, categories, search/filter/sort/pagination), listing detail, sell form with uploads/preview/declaration, edit, status controls, My Listings | Done |
| 4 | Messaging (realtime + polling fallback, idempotent send, delivery state), contact share, favourites, block, reports, automated checks | Done |
| 5 | Admin console: overview metrics, reports queue, listings, users & restrictions, appeals, policy versions/domains/meetup areas, audit log, deletion requests | Done |
| 6 | Lint, typecheck, unit + DB tests, build, Playwright smoke, docs | Done. The E2E journey suite is written but blocked on a Supabase stack (Docker not available here); see README "Verification status" |
| 7 | Admin platform: role/permission model, permission-aware RLS, atomic audited admin functions, admin shell and every module, `/api/admin/*`, tests and docs | Done (29 Oct 2026). See section 9 |

## 5. Decisions and assumptions (beyond the PRD)

| # | Decision | Rationale / PRD link |
|---|---|---|
| I-01 | University, domains and meetup areas are **data**, not code. Launch values (GITAM, `student.gitam.edu`) ship in migration 0006; meetup areas are added in `/admin/policy`. | Resolved 28 Oct 2026; A-02. |
| I-02 | Email + password auth with mandatory email confirmation; verification by link **or** 6-digit code. | AUTH-02 allows link or OTP; password reset route requested by build brief. |
| I-03 | Sign-up requires an explicit "I am 18 or older" confirmation and Terms/Privacy/rules acceptance, recorded with version and timestamp; enforced by the DB trigger. | A-07, journey 5.1 step 2. |
| I-04 | No alumni or staff for the pilot: only `student.gitam.edu` is allowlisted; `gitam.edu` and `gitam.in` are rejected (`tests/db/gitam.test.ts`). | Resolved 28 Oct 2026. |
| I-05 | "On hold" listings are hidden from default discovery (shown with the "Include on hold" filter) and cannot receive **new** conversations; existing conversations continue. | §8.3, P1 question on holds. |
| I-06 | Phone numbers, emails, UPI IDs, Aadhaar/PAN-like numbers and full ticket codes in public listing text are **blocked** with an actionable explanation (share contact privately in chat instead). External links and scam phrases ("advance payment", "share OTP") are **limited** for review. | §9.2 privacy-by-default; scam risk §12. |
| I-07 | Report auto-limit: a listing is hidden pending review when ≥ 2 distinct reporters choose a high-severity reason or ≥ 3 distinct reporters report it for any reason (configurable). Users are never auto-suspended by reports. | §5.4 step 18, §9.1. |
| I-08 | Seller ratings, structured offers and holds-for-a-buyer are **not** built. | PRD §3.3 recommended defaults. |
| I-09 | Notifications: in-product unread indicators only. Email notifications require a transactional email provider that is not configured; there is therefore no email-notification preference toggle. | CHAT-04 (P1) partially met. |
| I-10 | Account deletion: the user files a request, their live listings are removed immediately, and an admin completes the deletion (Auth user removed; cascades). Retention windows remain a legal decision. | AUTH-04, §3.3 retention question. |
| I-11 | Analytics are first-party rows in `analytics_events` (no third-party SDK). Search events store term count and zero-result flag; the query text is stored only for zero-result searches, letters only, max 60 chars. | AN-01, §11.3. |
| I-12 | Image safety: format/size validation, re-encoding, EXIF/GPS stripping and QR detection are implemented. Nudity/illegal-content image classification is **not** integrated; the provider interface (`src/features/moderation/providers.ts`) is ready for one. 1-D barcodes are not detected, so ticket photos are reviewed by a person (I-16). | SAFE-01, LIST-03 — documented limitation. |
| I-13 | English-only UI; copy is centralised enough to localise later. | PRD §3.3 P1 languages. |
| I-15 | **Pilot decision (29 Oct 2026): no campus meetup-area picker.** Buyers and sellers agree a place in chat ("Arrange in chat"). Safe-exchange guidance (busy, well-lit campus spots in daytime; inspect before paying; no advance payment) is shown non-blockingly on the sell form, listing detail and chat, and on `/safety`. The picker can be switched on later with `features.meetupAreas` plus areas in `/admin/universities`. | PRD A-03, journey 5.2 step 7 ("Arrange in chat" is a PRD option), SAFE-06. Closes the P0 meetup item for the pilot. |
| I-16 | **Pilot decision (29 Oct 2026): ticket listings with photos publish quarantined for review** (`ticket_photo_review`, limit). A person checks the photos for barcodes, QR codes and booking codes before other students see the listing; ticket listings without photos, and photos in every other category, still publish immediately. Mitigates the missing 1-D barcode detection. | SAFE-01, SAFE-05, PRD §8.4. Publish-first is kept for all other listings. |
| I-14 | Baseline Terms, Privacy Policy (DPDP Act aligned), Prohibited Items and Grievance Redressal pages are published under the Gitam Trades name, with Grievance Officer Dhanush (dhanush@gitamtrades.in). Not yet reviewed by counsel. | ADMIN-04, AC-16. Product name resolved: Gitam Trades. |

## 6. Security checklist

- RLS enabled on every table; explicit grants; `SECURITY DEFINER` functions use `set search_path = ''` and fully-qualified names; EXECUTE revoked from `public`/`anon` except `check_email_domain`.
- Service-role key only in `src/lib/supabase/admin.ts` (`server-only`), validated by `src/lib/env.ts`.
- Admin authorization: `requireAdmin()` / `requirePermission()` / `requireResourceAccess()` (pages) and `authorizeAdmin()` (actions, API) in `src/lib/auth/admin.ts` read `user_roles` server-side on every request; domain services re-assert; `admin_*` SQL functions re-check the actor's permission inside the database; RLS policies use `has_permission()`.
- Upload validation: authenticated + seller check, 8 MB raw limit, magic-byte sniffing (JPEG/PNG/WebP/HEIC rejected with guidance), decode-bomb guard (`limitInputPixels`), re-encode, storage path namespaced by user id.
- Rate limits enforced in Postgres triggers/RPCs (cannot be bypassed via direct API calls); Supabase Auth's built-in rate limits cover sign-up/sign-in/OTP emails.
- Private data never selected into public responses: `profile_private` is owner-only; contact details only appear inside `contact_share` messages visible to the two participants.
- Private pages are dynamic (session-dependent) and never cached across users; signed image URLs are short-lived.
- Security headers in `next.config.ts` (frame-ancestors none, nosniff, referrer policy, permissions policy).

## 7. Remaining work and blockers

| Item | Type | Notes |
|---|---|---|
| Run `tests/e2e/journeys.spec.ts` against a local/staging Supabase stack | Blocked (infrastructure) | Needs Docker + `supabase start` or a staging project |
| Campus meetup areas | Resolved for the pilot | "Arrange in chat" with in-product safety guidance (I-15) |
| Lawyer review of the published baseline policies | Legal (AC-16) | Recommended before scaling |
| Custom SMTP for gitamtrades.in | Ops (blocks sign-up) | README → How email verification works |
| Image content classifier (nudity/illegal content) | Engineering, needs a provider | Hook into `processImage` / engine context |
| Email notifications for new messages (CHAT-04, P1) | Engineering, needs SMTP/transactional email | |
| Cleanup job for unattached uploads | Engineering | Capped at 30 per user meanwhile |
| Error monitoring/uptime alerts, load test, accessibility audit, security review | Ops/QA | PRD §10, §15 |

## 8. Acceptance checklist

See `REQUIREMENTS_TRACEABILITY.md` for the per-requirement verification method and status. AC-16 (legal readiness) and the launch-readiness items that require named owners are outside engineering scope.

## 9. Admin platform (29 Oct 2026)

Architecture documents: [`docs/ADMIN_ROUTE_MAP.md`](docs/ADMIN_ROUTE_MAP.md) (routes, layouts, redirects, route-to-permission matrix), [`docs/ADMIN_DATA_BOUNDARIES.md`](docs/ADMIN_DATA_BOUNDARIES.md) (roles, permission matrix, ownership rules, RLS and storage matrix, audit events, sessions) and [`docs/ADMIN_API_CONTRACTS.md`](docs/ADMIN_API_CONTRACTS.md).

### Layers

| Layer | Implementation |
|---|---|
| Routes | `src/app/(site)` (student chrome) and `src/app/admin` (`login` public, `(console)` guarded shell). URLs unchanged; `/admin/audit` and `/admin/policy` redirect. |
| Pages | Every console page calls `requirePermission()`. Non-staff get a 404, stale sessions go to `/admin/login`, missing permissions redirect to `/admin?denied=...`. |
| Actions / API | `src/features/admin/actions.ts` (Server Actions); `src/features/admin/api.ts` + `src/app/api/admin/**` (Route Handlers with a same-origin JSON check and strict Zod bodies). |
| Services | `src/features/admin/services/*` (server-only; re-assert permissions; one implementation shared by pages, actions and the API). |
| Database | Migrations `20261029000004` (enums) and `20261029000005`: permission catalogue, `has_permission()`, permission-aware RLS, `admin_*` mutations (service-role only, take `p_actor`, re-check the permission, validate, write the audit record in the same transaction, rate-limited), `admin_list_*` / `admin_overview` / `admin_analytics` reads (raise `FORBIDDEN`), append-only triggers on the audit log, moderation events and report notes. |

### Checklist

| Item | Status |
|---|---|
| Role model (Super Admin, Moderator, Support Admin, Analyst) with server and database enforcement and a parity test | Done |
| Admin sign-in, admin session age limit, suspended staff lose access immediately | Done |
| No self-assignment or self-restriction; last Super Admin protected; only role managers restrict staff | Done (database-enforced) |
| Overview with date range, real data, "Unavailable" distinct from 0, recent activity, category distribution, charts | Done |
| Users: search (name, ID, exact email for Support/Super Admin, audited), filters, sort, pagination, detail tabs, risk signals, restrict/lift, export | Done |
| Listings: all states and categories, signals, detail with gallery, duplicates, history, quarantine/remove/restore, bulk up to 50 with confirmation | Done |
| Publication stays self-service (no approval queue) | Done (tested) |
| Reports: priority, assignment, Open/Investigating/Escalated/Action taken/Dismissed/Resolved, resolution codes, internal notes, reporter-only case view | Done |
| Moderation rules: structured editor (keyword rules, thresholds, rate limits, prohibited categories), versions and rollback, built-in checks, automated decision log, AI provider interface reported as not configured | Done |
| Categories: create, edit, reorder, enable, disable, delete unused, with integrity guards | Done |
| University and verification: details, domains (last-domain guard), meetup areas, verification overview | Done |
| Conversation investigation: metadata search, documented 30-minute grant, audited reads, participant exclusion, conversation restriction | Done |
| Analytics with date filters and CSV; audit log with filters and CSV; exports rate-limited and audited | Done |
| Platform settings (pause sign-ups / publishing / community; session age), enforced on the server | Done |
| E2E journeys against a real Supabase stack, including admin flows | Blocked: needs Docker or a staging project. Migrations `20261029000004` and `20261029000005` are not yet applied to the hosted project. |
| Editable policy pages and safety guidance (CMS) | Not built: policy pages remain version-controlled content |
| Configurable listing conditions and statuses | Not built: they are schema enums referenced by existing listings (shown read-only on `/admin/categories`) |
| Suspicious-signup detection beyond aggregate counts (e.g. IP velocity) | Not built: sign-up IPs aren't stored, and rejected domains never create rows |
