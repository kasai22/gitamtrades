# Requirements Traceability Matrix

Maps every requirement in [`PRD.md`](PRD.md) to where it's implemented and how it's verified.

**Status:** ✅ Implemented and verified by an automated test that ran · 🟡 Implemented; verification needs the Supabase stack (journey suite written, not yet run) or is manual · 🟠 Partial · ⬜ Not implemented / out of engineering scope.

**Verification keys:** `U` = unit test (`tests/unit`), `DB` = PGlite database test running the real migrations (`tests/db`), `E2E-S` = Playwright smoke (ran, no backend), `E2E-J` = Playwright journey suite (`tests/e2e/journeys.spec.ts`, needs `E2E_SUPABASE=1`), `M` = manual check.

## Functional requirements (PRD §7)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| AUTH-01 | University email registration; generic domains rejected | Launch domain `student.gitam.edu` (migration 0006); `handle_new_user()` trigger + `university_for_email()` / `check_email_domain()` (migration 0002); pre-check in `src/features/auth/actions.ts` `signUp`; email-change guard `handle_auth_user_updated()`; admin domain allowlist rejects generic providers (`src/features/admin/actions.ts`) | DB: "rejects emails outside the university domain allowlist", "blocks changing the account email…", `gitam.test.ts` (student domain allowed; staff, alumni and look-alike domains rejected); E2E-J: "rejects a generic email domain" | ✅ |
| AUTH-02 | Time-limited link or OTP; not verified until success; resend | Supabase Auth email confirmation; `/auth/callback` (PKCE), `/auth/confirm` (token hash), `verifyEmailCode` (6-digit OTP), `resendVerification`; `profiles.email_verified_at` synced by trigger; `is_verified_student()` gates RLS | DB: "marks the profile verified only when Auth confirms the email", "does not let unverified users start conversations"; E2E-J: journeys 1–2, 12 | ✅ (DB) / 🟡 (Auth flow) |
| AUTH-03 | Single account, dual capability; self-service seller enablement | `enable_selling()` RPC; `/sell` "Start selling" gate (`start-selling.tsx`); `can_sell()` | DB: "enables selling through the self-service RPC (AC-02)", "does not let sellers without seller permission publish"; E2E-J: journey 3 | ✅ |
| AUTH-04 | Logout, session recovery, deletion request | POST `/auth/signout` (local or global scope); password reset (`/forgot-password`, `/reset-password`); `request_account_deletion()` RPC + `/account/settings`; admin completion `/admin/deletion-requests` | E2E-S: "sign-out only accepts POST"; M | 🟡 |
| LIST-01 | Fast listing creation (title, category, price, condition, description, photos, meetup) | `src/features/listings/components/listing-form.tsx`, `saveListing` action, `persist_listing()` | U: listing form schema; DB: publish tests; E2E-J: journey 3. The <3-minute median is a usability-test metric, instrumented via `listing_published.time_to_publish_ms` | 🟡 |
| LIST-02 | INR pricing, ₹0 = "Free", no implied payment collection | `formatPrice`, `PriceDisplay`; "asking price" label + `OfflineTransactionNote` | U: "renders ₹0 as Free" | ✅ |
| LIST-03 | Multiple images, preview, compression, safety checks; private before publish | Client compression (`image-uploader.tsx`); `POST /api/uploads` → `processImage` (magic bytes, size, pixel limit, re-encode, EXIF strip, thumb, aHash, QR); private buckets + storage RLS (migration 0004) | U: `process-image.test.ts` (5 tests); DB: "keeps unpublished images private…", "prevents uploading into another user's folder", "rejects attaching another seller's image" | ✅ (no content classifier, see limitations) |
| LIST-04 | Instant publishing after automated checks, no approval queue | `saveListing` → `evaluateListing` → `persist_listing` sets `active`/`clear` | DB: "publishes permitted listings immediately…"; U: "allows ordinary listings…"; E2E-J: journey 3 | ✅ |
| LIST-05 | Edit, hold, sold, remove; propagates to details, search, saved | `change_listing_status()` RPC; `SellerControls`; status mirror `status.ts`; search excludes non-active; favourites show live status | DB: lifecycle tests + "sold listings drop out of discovery…"; DB parity: "SELLER_TRANSITIONS equals listing_transition_allowed()"; U: status machine; E2E-J: journey 10 | ✅ |
| LIST-06 | Seller declaration recorded with timestamp and policy version | `listing_declarations` written in `persist_listing`; form checkboxes; SQL rejects publishing without them | DB: "records the seller declaration…"; U: "requires the seller declaration to publish…" | ✅ |
| LIST-07 | Configurable expiry, reminder, renewal; expired hidden | `expires_at` from `policy.listingExpiryDays`; `effective_listing_status()`; `renew_listing()`; reminder banner in `/account/listings` (`expiryReminderDays`); `expire_stale_listings()` for pg_cron | DB: "treats past-expiry listings as expired and lets the seller renew them" | ✅ (email reminders ⬜) |
| DISC-01 | Launch categories + "Other permitted items" | Migration 0005 categories; `CategoryNavigation`; `/categories/[slug]` | DB: migrations test (9 categories); E2E-J | ✅ |
| DISC-02 | Keyword search over title and description; empty/no-result/partial | `search_listings()` with `build_prefix_tsquery()` (prefix matching, stemming); empty states in `DiscoveryView` | DB: "supports prefix search…", "handles empty/garbage queries"; E2E-J: journey 4 | ✅ |
| DISC-03 | Filters (category, price, condition, status) + sort; visible, removable, in URL | `parseSearchParams`/`toQueryString`/`activeFilterChips`; GET `FilterPanel`; `SortMenu` | U: search params tests; DB: filter and sort assertions | ✅ |
| DISC-04 | Detail with price, condition, images, times, category, verified indicator, availability; unavailable not contactable | `/listings/[id]`; `isContactable()`; `start_conversation()` rejects unavailable listings | U: "is contactable only when active…"; DB: "refuses new conversations on sold listings…"; E2E-J: journey 10 | ✅ |
| DISC-05 (P1) | Saved listings across devices | `favourites` table + RLS; `FavouriteButton`; `/account/favourites` | M (RLS policy covered by grants review) | 🟡 |
| CHAT-01 | Message seller from listing; listing context; delivery/failed state | `start_conversation()` (idempotent); `messages` RLS + triggers; `ChatThread` (Realtime + polling, optimistic send, retry, client-id idempotency); listing context card | DB: messaging suite (participants only, spoofing, system messages, idempotent retries, unread); E2E-J: journeys 4–7 | ✅ (DB) / 🟡 (UI) |
| CHAT-02 | Optional contact share by explicit action | `shareContact` action + `ContactShareDialog`; `profile_private` owner-only; engine blocks contact details in public listing text | DB: "lets verified students see campus profiles but not private data"; U: "blocks contact details…" | ✅ |
| CHAT-03 | Block and report from chat | `blocks` + `can_message()`; `ThreadMenu`; per-message `ReportDialog` (evidence snapshot) | DB: "stops blocked users from sending new messages but keeps the history", "snapshots reported message content as evidence" | ✅ |
| CHAT-04 (P1) | In-product and email notifications with preferences | Unread badges (`unread_conversation_count()`, header, inbox) | DB: "tracks unread state per participant" | 🟠 Email notifications and preferences not built (no email provider) |
| SAFE-01 | Automated moderation of text, category, images, repeat offenders; specific reason | `src/features/moderation/engine.ts` + `policy.ts` + `server.ts` (duplicates, copied text, reused images, repeat offenders); QR detection; ticket listings with photos quarantined for human review (I-16) | U: engine tests incl. near-miss items, obfuscation and the ticket-photo rule | ✅ (no image content classifier; ticket photos human-reviewed) |
| SAFE-02 | Report reasons; traceable cases; duplicate spam can't cause unbounded action | `submit_report()` (case numbers, per-reporter de-dup, rate limit, distinct-reporter thresholds); `ReportDialog` | DB: "creates a traceable case, de-duplicates…", "auto-limits a listing once enough independent…"; E2E-J: journey 8 | ✅ |
| SAFE-03 | Post-publication enforcement; reason, time, rule version, actor recorded | Report auto-limit in SQL; `moderateListing`, `restrictUser`; `moderation_events` + `admin_audit_logs` | DB: moderation event assertions; E2E-J: journey 9 | ✅ |
| SAFE-04 | Appeal path from the explanation screen with case ID | `ModerationNotice` → `/appeals/new`; account restriction banner; `submit_appeal()`; `/admin/appeals` | DB: "allows appeals only for your own restricted listings and returns a case id" | ✅ |
| SAFE-05 | Readable prohibited/restricted rules; linked from listing confirmation | `/policies/prohibited-items`; links in declaration, sign-up and "Start selling" | E2E-S: "prohibited items policy lists ticket rules" | ✅ |
| SAFE-06 | Safe meetup guidance at listing/contact stages, non-blocking | `SafetyTips` on the sell form, listing detail and chat composer; `/safety` | E2E-S (policy page renders) + M | ✅ |
| ADMIN-01 | Role-based admin search, inspection, action; privileged actions audited | Four roles + `admin_role_permissions`; `requirePermission()` / `authorizeAdmin()` (`src/lib/auth/admin.ts`); permission-aware RLS; `admin_*` functions re-check the actor and write `admin_audit_logs` (append-only) in the same transaction; `/admin/users`, `/admin/listings`, `/admin/messages` | DB: `tests/db/admin.test.ts` (matrix parity, RLS per role, FORBIDDEN for out-of-role actors, self/staff/last-Super-Admin guards, append-only audit, conversation grants); U: `tests/unit/admin.test.ts` (authorizeAdmin, API 401/403/CSRF); E2E-S: admin boundary | ✅ (DB, unit, smoke) / 🟡 (E2E journeys) |
| ADMIN-02 | Queue for reports, appeals, escalations; not pre-approval | `/admin/reports` (priority, assignment, notes, resolution codes), `/admin/appeals`, `/admin/listings?state=quarantined`; publication stays self-service | DB: report triage workflow, "publishes normal listings immediately without approval"; E2E-J: journey 9 | ✅ (DB) / 🟡 (E2E) |
| ADMIN-03 | Configure terms, categories, domains, rate limits, thresholds; versioned, auditable, rollback | `/admin/moderation` structured policy editor (`admin_create_policy_version`, rollback via `admin_activate_policy`), `/admin/categories`, `/admin/universities`, `/admin/settings`; all audited with before/after values | DB parity: "DEFAULT_POLICY equals policy version 1"; DB: category/domain guard rails, settings validation, sign-up pause | ✅ (DB) / 🟡 (E2E) |
| ADMIN-04 | Grievance contact on footer, policy and support surfaces | `/grievance` (officer Dhanush, dhanush@gitamtrades.in, response timelines); footer, Help, Terms, Privacy and policy-page links; `appConfig.grievance` | E2E-S: landing footer link | ✅ |
| AN-01 | Funnel, listing, search, messaging, sold, safety events without unnecessary personal data | `src/lib/analytics.ts` (whitelisted Zod schemas, `after()`), `analytics_events` (staff-only RLS); `admin_metrics()` dashboard incl. north-star | DB: staff-only analytics table; U: zero-result query sanitiser is covered indirectly | 🟡 Event property verification in staging (AC-15) |

## Acceptance criteria (PRD §14)

| AC | Implementation / evidence | Status |
|---|---|---|
| AC-01 Verified access | `is_verified_student()` in RLS and RPCs; `requireVerified`; DB + E2E-J 12 | ✅ |
| AC-02 Seller permission | `enable_selling()`; `persist_listing` requires `seller_enabled_at`; DB tests | ✅ |
| AC-03 Hassle-free listing | Shared Zod schema with field errors; publish without review; U + DB + E2E-J 3 | ✅ / 🟡 |
| AC-04 Automated policy handling | Engine + `ModerationNotice`; U + DB + E2E-J | ✅ |
| AC-05 Discovery | `/marketplace`, `/search`, `/categories/[slug]`, filters; DB + E2E-J 4 | ✅ / 🟡 |
| AC-06 Conversation | Listing context card for both participants; DB + E2E-J 4–7 | ✅ / 🟡 |
| AC-07 Contact privacy | `profile_private` owner-only; listing text blocks contact details; share dialog; DB + U | ✅ |
| AC-08 Offline transaction | No payment fields anywhere; copy on home, listing, chat, terms; E2E-S landing | ✅ |
| AC-09 Sold state | DB "sold listings drop out of discovery…"; E2E-J 10 | ✅ |
| AC-10 Reports and blocking | DB report and block suites | ✅ |
| AC-11 Admin enforcement | Console + `admin_*` functions + audit; DB admin suite; E2E-J 9 | ✅ (DB) / 🟡 (E2E) |
| AC-12 Appeals and transparency | Explanations with matched phrase + appeal path; DB appeal test | ✅ |
| AC-13 Security and privacy | Server-side authz, RLS, explicit grants, upload validation, no PII in analytics; DB security suite, U image tests | ✅ (external security review still required) |
| AC-14 Accessibility and responsive UX | Semantic landmarks, skip link, labels, `aria-invalid`/`aria-describedby`, error summaries, focus rings, reduced motion, 360px layouts; E2E-S overflow + skip link | 🟠 Manual screen-reader/keyboard audit of signed-in flows still needed |
| AC-15 Analytics | Events implemented with documented schemas (`src/lib/analytics.ts`) | 🟡 Staging verification |
| AC-16 Legal readiness | Baseline Terms, Privacy Policy, Prohibited Items and Grievance Redressal published | 🟠 Not yet reviewed by counsel |

## Non-functional requirements (PRD §10)

| Area | Implementation | Status |
|---|---|---|
| Performance | Static shells (Cache Components/PPR), Suspense streaming, indexed queries (`listings_discovery_idx`, GIN search index), one-RPC search with window count, 480px thumbnails, lazy images, signed-URL batching | 🟡 Needs real-device and load measurement |
| Availability | Hosting/Supabase plan dependent | ⬜ Ops |
| Responsive UX | Mobile-first layouts, mobile nav sheet, filter drawer, sticky publish bar; 360px smoke test | ✅ |
| Accessibility | See AC-14 | 🟠 |
| Security | RLS + explicit grants, `SECURITY DEFINER` with `search_path=''`, service key server-only, POST sign-out, open-redirect guard (`safeNextPath`, U tested), security headers (E2E-S), upload validation, DB-enforced rate limits | ✅ (pre-launch OWASP review ⬜) |
| Privacy | Data minimisation (`profile_private`, analytics whitelist), EXIF stripping, deletion workflow | 🟠 Retention schedule pending legal |
| Reliability | Idempotent publish (`client_request_id`) and messages (`client_id`); retry UI; atomic `persist_listing` | ✅ (DB tests) |
| Scalability | Indexed, paginated queries; no N+1 on list pages | 🟡 Load test |
| Moderation latency | Deterministic engine plus 4 parallel context queries | 🟡 Measure in staging |
| Observability | Moderation/audit trails, analytics, structured warnings | 🟠 Error monitoring/uptime alerts not integrated |
| Maintainability | Policy, domains, meetup areas configurable without redeploy (versioned); generated DB types | ✅ |
| Browser support | Modern evergreen browsers (Next.js 16 baseline) | 🟡 Cross-browser pass |

## Business rules (PRD §8)

| Rule | Implementation | Status |
|---|---|---|
| §8.1 roles | Visitor (public pages only; proxy + page guards), verified student, seller-enabled, admin/moderator (`user_roles`) | ✅ |
| §8.2 field validation | `listingFormSchema` + DB check constraints; ticket confirmation required in SQL | ✅ |
| §8.3 lifecycle | `listing_transition_allowed()` + mirror; blocked → draft; admin restore publishes | ✅ |
| §8.4 prohibited items | Policy v1 term rules (block/limit), regulated goods disabled, ticket QR/code guardrails | ✅ (lists need policy-owner review) |

## Additions beyond the PRD

| Feature | Implementation | Verification | Status |
|---|---|---|---|
| Community threads (requested 29 Oct 2026) | Migrations `20261029000001/2`; `src/features/community/*`; `/community`, `/community/new`, `/community/[postId]`, `/admin/community`; `evaluateCommunityText` | DB: `tests/db/community.test.ts` (11: no direct writes, visibility, review hiding, eligibility, nesting/depth cap, locked threads, rate limit, vote integrity, Top sort, reports + auto-hide, deleted-account anonymisation); U: `tests/unit/community.test.ts` (5) | ✅ (DB/unit) / 🟡 (UI against live stack) |
| Meetup areas paused | `features.meetupAreas = false` in `src/lib/config.ts`; data model and admin code retained | M | ✅ |

## Not built (by PRD decision or out of scope)

Payments, escrow, delivery, ratings, structured offers, holds-for-a-buyer, multi-university discovery and email notifications. Each follows the PRD §2.2/§3.3 defaults; see IMPLEMENTATION_PLAN I-08/I-09.
