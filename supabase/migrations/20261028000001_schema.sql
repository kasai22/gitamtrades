-- University Student Marketplace — core schema
-- Tables, enums, constraints and indexes. Functions/triggers live in 0002, RLS and grants in 0003,
-- storage in 0004 and launch configuration data (categories, default policy) in 0005.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.listing_status as enum ('draft', 'active', 'on_hold', 'sold', 'expired', 'removed');
create type public.moderation_status as enum ('unchecked', 'clear', 'limited', 'blocked', 'removed');
create type public.moderation_source as enum ('automated_check', 'user_reports', 'admin');
create type public.item_condition as enum ('new', 'like_new', 'good', 'fair', 'for_parts');
create type public.app_role as enum ('admin', 'moderator');
create type public.message_kind as enum ('text', 'contact_share', 'system');
create type public.report_target as enum ('listing', 'user', 'message');
create type public.report_reason as enum (
  'prohibited_item', 'scam', 'counterfeit', 'misleading', 'harassment', 'safety', 'spam', 'other'
);
create type public.report_status as enum ('open', 'in_review', 'actioned', 'dismissed', 'escalated');
create type public.appeal_status as enum ('open', 'upheld', 'overturned');
create type public.restriction_kind as enum ('suspension', 'listing_ban', 'messaging_ban');
create type public.deletion_request_status as enum ('pending', 'completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- University configuration
-- ---------------------------------------------------------------------------
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 120),
  short_name text check (short_name is null or char_length(short_name) <= 30),
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.university_domains (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  domain text not null unique check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  is_active boolean not null default true,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index university_domains_university_idx on public.university_domains (university_id);

create table public.meetup_areas (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 200),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (university_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text,
  icon text not null default 'package',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_ticket boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  university_id uuid not null references public.universities (id),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 50),
  avatar_path text,
  email_verified_at timestamptz,
  seller_enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_university_idx on public.profiles (university_id);

-- Owner-only data. Never joined into responses for other users.
create table public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  email_domain text not null,
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9][0-9 -]{7,17}$'),
  age_confirmed_at timestamptz not null,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  seller_terms_accepted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.account_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.restriction_kind not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id) on delete set null,
  lift_reason text
);
create index account_restrictions_user_idx on public.account_restrictions (user_id) where lifted_at is null;

-- ---------------------------------------------------------------------------
-- Policy configuration (versioned; exactly one active)
-- ---------------------------------------------------------------------------
create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  config jsonb not null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  is_active boolean not null default false
);
create unique index policy_versions_single_active on public.policy_versions ((true)) where is_active;

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  university_id uuid not null references public.universities (id),
  category_id uuid not null references public.categories (id),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  price_inr integer not null check (price_inr between 0 and 1000000),
  condition public.item_condition not null,
  meetup_area_id uuid references public.meetup_areas (id) on delete set null,
  ticket_event_name text check (ticket_event_name is null or char_length(ticket_event_name) <= 100),
  ticket_event_date date,
  ticket_transfer_confirmed boolean not null default false,
  status public.listing_status not null default 'draft',
  moderation_status public.moderation_status not null default 'unchecked',
  moderation_source public.moderation_source,
  moderation_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(moderation_reasons) = 'array'),
  moderation_rule_version text,
  client_request_id uuid,
  published_at timestamptz,
  expires_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'B')
  ) stored,
  unique (seller_id, client_request_id)
);
create index listings_discovery_idx on public.listings (university_id, published_at desc)
  where status in ('active', 'on_hold') and moderation_status = 'clear';
create index listings_category_idx on public.listings (category_id, published_at desc);
create index listings_price_idx on public.listings (university_id, price_inr);
create index listings_seller_idx on public.listings (seller_id, created_at desc);
create index listings_moderation_idx on public.listings (moderation_status, updated_at desc)
  where moderation_status in ('limited', 'blocked', 'removed');
create index listings_search_idx on public.listings using gin (search_vector);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete cascade,
  storage_path text not null unique,
  thumb_path text not null unique,
  position smallint not null default 0 check (position between 0 and 19),
  width integer,
  height integer,
  content_hash text not null,
  qr_detected boolean not null default false,
  created_at timestamptz not null default now()
);
create index listing_images_listing_idx on public.listing_images (listing_id, position);
create index listing_images_hash_idx on public.listing_images (content_hash);
create index listing_images_pending_idx on public.listing_images (owner_id, created_at) where listing_id is null;

create table public.listing_declarations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  policy_version text not null,
  owns_item boolean not null,
  complies_with_policy boolean not null,
  ticket_transferable boolean,
  declared_at timestamptz not null default now()
);
create index listing_declarations_listing_idx on public.listing_declarations (listing_id, declared_at desc);

create table public.favourites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index favourites_listing_idx on public.favourites (listing_id);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text,
  buyer_last_read_at timestamptz,
  seller_last_read_at timestamptz,
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc nulls last);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc nulls last);
create index conversations_buyer_created_idx on public.conversations (buyer_id, created_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind public.message_kind not null default 'text',
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  client_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (conversation_id, client_id)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id, created_at);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- Safety: reports, appeals, moderation trail, audit
-- ---------------------------------------------------------------------------
create sequence public.report_case_seq;
create sequence public.appeal_case_seq;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('R-' || lpad(nextval('public.report_case_seq')::text, 6, '0')),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type public.report_target not null,
  listing_id uuid references public.listings (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  reason public.report_reason not null,
  details text check (details is null or char_length(details) <= 1000),
  severity smallint not null check (severity between 1 and 3),
  status public.report_status not null default 'open',
  evidence jsonb not null default '{}'::jsonb,
  resolution_summary text check (resolution_summary is null or char_length(resolution_summary) <= 1000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_queue_idx on public.reports (status, severity desc, created_at);
create index reports_listing_idx on public.reports (listing_id) where listing_id is not null;
create index reports_user_idx on public.reports (reported_user_id) where reported_user_id is not null;
create index reports_reporter_idx on public.reports (reporter_id, created_at);
-- A reporter can hold at most one open case per target (duplicate-report spam guard, SAFE-02).
create unique index reports_open_dedupe_idx on public.reports (
  reporter_id, target_type, (coalesce(message_id, listing_id, reported_user_id))
) where status in ('open', 'in_review');

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('A-' || lpad(nextval('public.appeal_case_seq')::text, 6, '0')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  restriction_id uuid references public.account_restrictions (id) on delete set null,
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  status public.appeal_status not null default 'open',
  resolution_summary text check (resolution_summary is null or char_length(resolution_summary) <= 1000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((listing_id is not null) <> (restriction_id is not null))
);
create index appeals_queue_idx on public.appeals (status, created_at);
create unique index appeals_open_dedupe_idx on public.appeals (user_id, (coalesce(listing_id, restriction_id)))
  where status = 'open';

create table public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete set null,
  subject_user_id uuid references public.profiles (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  appeal_id uuid references public.appeals (id) on delete set null,
  action text not null check (action in (
    'auto_published', 'auto_limited', 'auto_blocked', 'report_auto_limited', 'expired',
    'admin_removed', 'admin_restored', 'admin_limited',
    'admin_restricted', 'admin_restriction_lifted',
    'report_in_review', 'report_dismissed', 'report_actioned', 'report_escalated',
    'appeal_upheld', 'appeal_overturned'
  )),
  source text not null check (source in ('automated_check', 'user_reports', 'admin', 'system')),
  reason_codes text[] not null default '{}',
  reason_text text,
  rule_version text,
  actor_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index moderation_events_listing_idx on public.moderation_events (listing_id, created_at desc);
create index moderation_events_user_idx on public.moderation_events (subject_user_id, created_at desc);
create index moderation_events_created_idx on public.moderation_events (created_at desc);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_type, target_id);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 500),
  status public.deletion_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles (id) on delete set null
);
create unique index account_deletion_pending_idx on public.account_deletion_requests (user_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Product analytics (first-party, privacy-minimised)
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id bigint generated always as identity primary key,
  name text not null check (name ~ '^[a-z_]{3,40}$'),
  user_id uuid,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_name_idx on public.analytics_events (name, created_at desc);
