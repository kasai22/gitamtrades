# Gitam Trades

A student-only, peer-to-peer marketplace where verified GITAM students buy, sell and pass on items on campus. It's built from [`PRD.md`](PRD.md) (v1.0). The architecture and decisions are in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), and per-requirement status is in [`REQUIREMENTS_TRACEABILITY.md`](REQUIREMENTS_TRACEABILITY.md).

- **Students only:** sign-up requires a `@student.gitam.edu` email (no alumni or staff), enforced in the database. Email verification (link or 6-digit code) gates every marketplace feature.
- **Publish-first:** listings go live immediately after deterministic automated checks. There is no human approval queue. Clear violations are blocked with a specific reason and a review path, and ambiguous signals are hidden pending review.
- **Offline settlement:** in-app chat, optional contact sharing to one person, and in-person exchange. The site never collects, holds or transfers payment.
- **Community:** Reddit-style discussion threads at `/community`. Topic-tagged posts, nested replies (up to 9 levels, collapsible), up/down votes with Hot/New/Top sorting, reports, author deletion ("[deleted]") and a moderation queue at `/admin/community` (remove/restore/lock/pin). Posts and comments go through the same automated text checks, and the database enforces eligibility, rate limits (10 posts/day, 10 comments/minute, 300/day), thread depth and vote integrity.
- **Safety tooling:** reports with case numbers, de-duplication and threshold auto-hiding, blocks, appeals, account restrictions, a versioned policy and a full audit trail.

> **Pilot decision:** no meetup-area picker. Sellers and buyers agree a spot in chat, with safe-exchange guidance shown on the sell form, listing and chat (`features.meetupAreas = false` in `src/lib/config.ts`; set it to `true` and add areas in **/admin/universities** to bring the picker back).
>
> **Pilot decision:** event-ticket listings **with photos** publish quarantined until a moderator checks the photos for barcodes, QR codes and booking codes (`ticket_photo_review`). Review them in **/admin/listings?state=quarantined&signal=ticket_photo_review**. Text-only ticket listings and all other categories publish immediately.
>
> Launch configuration: GITAM (Deemed to be University), allowlisted domain `student.gitam.edu` (migration `20261028000006_gitam_launch.sql`). Sellers choose "Arrange in chat" (no meetup areas for the pilot). Grievance Officer: Dhanush, dhanush@gitamtrades.in.

## Stack

Next.js 16 (App Router, Cache Components, `proxy.ts`), React 19, strict TypeScript, Tailwind CSS v4, shadcn/ui on Radix, Lucide, Sonner, Zod 4 and React Hook Form. Supabase provides Postgres, Auth, Storage and Realtime. Images are processed with sharp and jsQR. Tests use Vitest (with PGlite for database tests) and Playwright.

## Project structure

```
src/app/                 routes (pages, route handlers, loading/error boundaries)
src/components/ui/       shadcn/Radix primitives (Button, Dialog, Select, Sheet, Table, ...)
src/components/layout/   header, user menu, mobile navigation, footer
src/components/          shared product components (ProductCard, badges, states, safety tips, forms)
src/features/<feature>/  domain logic, server actions, queries and feature components
  auth/ listings/ search/ messaging/ moderation/ admin/ account/ uploads/
src/lib/                 env validation, Supabase clients, session DAL, analytics, storage, errors
src/types/database.ts    generated DB types (npm run db:types)
supabase/migrations/     schema, functions/RPCs, RLS + grants, storage policies, launch config
supabase/seed.sql        sample meetup areas for local development only
supabase/templates/      branded auth emails (verification, password reset, email change)
tests/unit/              moderation engine, schemas, state machine, search params, image pipeline
tests/db/                PGlite: applies the real migrations; RLS, triggers, RPCs, parity checks
tests/e2e/               Playwright smoke (no backend) and MVP journeys (Supabase stack)
```

## Getting started

Prerequisites: Node.js 20.9+ (developed on Node 24) and npm. For a local backend you also need Docker plus the Supabase CLI (`npx supabase`).

```bash
npm install
cp .env.example .env.local        # fill in the values (see below)
```

### Option A: local Supabase (recommended for development and E2E)

```bash
npx supabase init                 # creates supabase/config.toml (keep the existing migrations/seed)
```

Edit `supabase/config.toml`:

```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback", "http://localhost:3000/auth/confirm"]

[auth.email]
enable_confirmations = true       # REQUIRED: verification is the identity gate (AUTH-02)
```

Then:

```bash
npx supabase start                # prints the API URL, publishable/anon key and secret/service key
npx supabase db reset             # applies supabase/migrations/* and supabase/seed.sql
npm run dev
```

Local emails (the verification link and code) appear in Mailpit at http://127.0.0.1:54324.

### Option B: hosted Supabase project

1. Create a project, then apply the migrations in order (`npx supabase link` then `npx supabase db push`, or paste each file from `supabase/migrations/` into the SQL editor).
2. **Auth → Providers → Email:** enable *Confirm email*. Set a minimum password length of 10.
3. **Auth → URL Configuration:** set the Site URL to your origin. Add `https://<origin>/auth/callback` and `https://<origin>/auth/confirm` to the redirect URLs.
4. **Email templates:** use the files in `supabase/templates/` (see "How email verification works"). They link through `/auth/confirm`, which works even when the email is opened on another device. The minimal equivalent of the *Confirm signup* template is:
   ```html
   <p>Your verification code is <strong>{{ .Token }}</strong></p>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/marketplace">Verify your university email</a></p>
   ```
   Change the *Reset password* template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`. The default templates also work through `/auth/callback` (PKCE, same browser only).
5. Configure a custom SMTP provider before the pilot. Supabase's built-in mailer is heavily rate-limited.
6. **Realtime:** the migration adds `public.messages` to the `supabase_realtime` publication. Without Realtime, chat falls back to 15-second polling.
7. Set up email verification (see below) and create the first admin.

### How email verification works

1. Only `@student.gitam.edu` addresses can create an account. A database trigger rejects every other domain, including `gitam.edu` (staff) and personal email, so the rule can't be bypassed by calling the API directly.
2. Supabase Auth emails a verification link **and** a 6-digit code to that address. Until it's confirmed, the account can't sign in, browse, message or sell. Owning a working GITAM student inbox is the proof of eligibility.
3. The student clicks the link (`/auth/confirm`) or types the code on `/verify-email`. Links and codes expire; "Resend verification email" sends a fresh one.

To make it work on your Supabase project:

- **Authentication → Sign In / Providers → Email:** turn on *Confirm email*.
- **Authentication → URL Configuration:** Site URL = your site (e.g. `https://gitamtrades.in`). Redirect URLs: `https://gitamtrades.in/auth/confirm`, `https://gitamtrades.in/auth/callback`, plus `http://localhost:3000/**` for development.
- **Authentication → Emails → Templates:** paste `supabase/templates/confirm-signup.html` into *Confirm signup*, `reset-password.html` into *Reset password* and `change-email.html` into *Change email address*. Each file's first line has the subject.
- **Authentication → Emails → SMTP Settings (required).** Supabase's built-in sender only delivers to your own project team's addresses and is heavily rate-limited, so students won't receive anything without custom SMTP. Use a transactional provider (e.g. Resend, Amazon SES, Brevo or Zoho ZeptoMail). Verify `gitamtrades.in` there by adding its SPF, DKIM and DMARC DNS records, and send from an address like `no-reply@gitamtrades.in`. Authenticated mail is far less likely to land in spam on GITAM's mail system.
- Test by signing up with your own `@student.gitam.edu` address.

Domains and meetup areas can be changed later in **/admin/universities** (Super Admin, audited). Generic email providers are always rejected there.

### Create the first Super Admin

Sign up normally, verify the email, then run in the SQL editor (this is the only time a role is written outside the console):

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'your.name@student.gitam.edu';
```

Sign in at **/admin/login**. Super Admins grant `moderator`, `support_admin` or `analyst` (or another `super_admin`) from **/admin/roles**. Roles and permissions are described in [`docs/ADMIN_DATA_BOUNDARIES.md`](docs/ADMIN_DATA_BOUNDARIES.md). Existing `admin` grants from earlier deployments become `super_admin` when migration `20261029000004` runs.

### Admin console

| Area | Route | Notes |
|---|---|---|
| Sign-in | `/admin/login` | Same Supabase account; only staff are admitted. Console sessions older than the configured age (default 12 h) must sign in again. |
| Overview | `/admin` | Live snapshot + date-range activity; failed metrics show “Unavailable”, never 0 |
| Users | `/admin/users` | Search/sort/paginate; restrictions; audited email lookup (Support/Super Admin) |
| Listings | `/admin/listings` | All states and categories; quarantine/remove/restore, bulk up to 50 with confirmation |
| Reports | `/admin/reports` | Queue with priority, assignment, internal notes, resolution codes |
| Conversations | `/admin/messages` | Metadata search; reading messages needs a documented reason (30-min audited grant) |
| Moderation rules | `/admin/moderation` | Versioned keyword rules, thresholds, prohibited categories, rollback |
| Categories, University, Settings | `/admin/categories`, `/admin/universities`, `/admin/settings` | Super Admin changes; emergency switches (pause sign-ups / publishing / community) |
| Analytics, Audit log, Roles | `/admin/analytics`, `/admin/audit-logs`, `/admin/roles` | CSV exports are permission-checked, rate-limited and audited |

The HTTP API under `/api/admin/*` is documented in [`docs/ADMIN_API_CONTRACTS.md`](docs/ADMIN_API_CONTRACTS.md); routes and redirects in [`docs/ADMIN_ROUTE_MAP.md`](docs/ADMIN_ROUTE_MAP.md).

### Scheduled jobs (recommended)

Discovery already hides listings past `expires_at`. To persist the `expired` status (for reporting), schedule:

```sql
create extension if not exists pg_cron;
select cron.schedule('expire-listings', '15 * * * *', $$select public.expire_stale_listings()$$);
```

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | browser + server | Publishable key; RLS enforces access |
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | **server only** | Service client for `persist_listing`, admin actions, audit and analytics |
| `NEXT_PUBLIC_SITE_URL` | server | Origin used in email redirect links |
| `NEXT_PUBLIC_APP_NAME` | browser | Product name (default "Gitam Trades") |
| `NEXT_PUBLIC_GRIEVANCE_*`, `NEXT_PUBLIC_SUPPORT_EMAIL` | browser | Grievance Officer and support contact (defaults: Dhanush, dhanush@gitamtrades.in) |

Variables are validated lazily in `src/lib/env.ts` and `src/lib/env.server.ts`. If Supabase isn't configured, auth pages show a "Backend not configured" notice instead of fake data.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next + React Compiler rules) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest: unit + PGlite database tests |
| `npm run test:db` | Database tests only (real migrations, RLS, triggers, RPCs) |
| `npm run test:e2e` | Playwright. The smoke suite always runs; journeys need `E2E_SUPABASE=1` and a local stack |
| `npm run db:types` | Regenerate `src/types/database.ts` from the migrations (no Docker needed) |
| `npm run check` | lint + typecheck + tests + build |

## Verification status (29 Oct 2026)

All of the following were run in this environment after the admin platform was added:

| Check | Result |
|---|---|
| `npm run lint` | Pass, 0 problems |
| `npm run typecheck` | Pass |
| `npm test` | **154 / 154 pass**: 57 unit (moderation engine, community checks, schemas, status machine, search params, helpers, image pipeline, admin authorization: permission resolution, session age, `authorizeAdmin`, API 401/403/CSRF, list-parameter allow-lists, CSV formula guard, date ranges, navigation) and 97 database tests, including 33 admin tests (permission-matrix parity, role-scoped RLS, FORBIDDEN for out-of-role actors, self/staff/last-Super-Admin guards, append-only audit log, report triage, conversation access grants, category/domain guard rails, sign-up pause, export rate limits, publish-without-approval) |
| `npm run build` | Pass (admin pages render a static shell with the session streamed in; admin APIs are dynamic) |
| `playwright test tests/e2e/smoke.spec.ts` | **36 / 36 pass** (desktop + 360px), including the signed-out admin boundary: redirects to `/admin/login`, 401 JSON from `/api/admin/*` with `no-store`, CSRF rejection, renamed-route redirects |
| `tests/e2e/journeys.spec.ts` (12 MVP journeys) | **Not run.** It needs Docker + `supabase start` (or a staging project with migrations `20261029000004`/`0005` applied), which weren't available here. Run with `E2E_SUPABASE=1 npm run test:e2e` |

The database tests run the real migrations on PGlite (WASM Postgres) against stubbed `auth`/`storage` schemas and Supabase-style roles (`tests/db/supabase-stubs.sql`). They prove the SQL and policies behave as intended. They do not cover Supabase Auth, Storage or Realtime services themselves; the journey suite does.

## Deployment

1. Provision Supabase (Option B above): migrations, auth settings, SMTP, university, first admin.
2. Deploy the Next.js app (for example on Vercel, or `npm run build && npm start` on a Node 20.9+ host). Set the environment variables, with `SUPABASE_SECRET_KEY` as a server-only secret.
3. Set `NEXT_PUBLIC_SITE_URL` to the production origin and add it to the Supabase redirect URLs.
4. Run `E2E_SUPABASE=1 npm run test:e2e` against a **staging** stack (never production) before the pilot.
5. Work through the launch readiness checklist in PRD §15, especially legal sign-off (AC-16).

## Known limitations

See `REQUIREMENTS_TRACEABILITY.md` for the full list. In short:

- **Image moderation** covers format and size checks, re-encoding, EXIF/GPS stripping, QR detection and reused-image detection. There is no nudity or illegal-content classifier. `processImage` is the extension point. 1-D barcodes aren't detected.
- **Notifications** are in-app unread badges only. Email notifications need a transactional email provider (CHAT-04 is P1).
- **Community rate limits** use database defaults (`policy_int` paths `community.*`) and aren't yet editable in the policy editor UI. Posts can be deleted but not edited.
- **Admin email lookup** is exact-match only and limited to Support/Super Admins (each lookup is audited); there's no partial email search by design.
- **AI moderation** isn't integrated. `src/features/moderation/providers.ts` defines the provider-independent interface; the console reports it as not configured.
- **Report reasons** are the eight existing student-facing categories; “suspicious account / repeated abuse” is handled as a user report plus the repeat-violation signals rather than a separate reason.
- **Community moderation and account deletion** write their audit records in a second step (they call Storage/Auth or update several tables from the server), so unlike the other admin actions they aren't a single database transaction.
- **Unattached uploads** (photos uploaded but never published) aren't garbage-collected yet. They're capped at 30 per user.
- **Policy pages** (Terms, Privacy, Prohibited Items, Grievance Redressal) are published baseline policies. They haven't been reviewed by a lawyer; get them reviewed before the user base grows.
- **Retention commitments** in the Privacy Policy are operational: an admin must complete deletion requests in **/admin/deletion-requests** within 30 days. Safety records are kept, with no automatic purge yet.
