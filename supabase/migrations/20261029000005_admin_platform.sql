-- Admin platform: permission model, permission-aware RLS, report triage and internal notes,
-- reported-conversation investigation, platform settings, append-only audit trail and atomic,
-- permission-checked admin operations. See docs/ADMIN_DATA_BOUNDARIES.md.
--
-- Security model for admin writes: every admin_* mutation is SECURITY DEFINER, executable only by
-- service_role, takes the acting admin's id (p_actor), re-checks that admin's permission inside the
-- database, validates input, performs every step in one transaction and writes the audit record in
-- that same transaction. Admin reads that need joins are SECURITY DEFINER functions callable by
-- authenticated users that raise FORBIDDEN unless has_permission() passes.

-- ---------------------------------------------------------------------------
-- Permission catalogue (mirrored in src/lib/auth/permissions.ts; tests/db/admin.test.ts checks parity)
-- ---------------------------------------------------------------------------
create table public.admin_role_permissions (
  role public.app_role not null,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);

insert into public.admin_role_permissions (role, permission)
select 'super_admin'::public.app_role, p from unnest(array[
  'overview.view', 'analytics.view', 'analytics.export',
  'users.view', 'users.view_contact', 'users.restrict', 'users.export',
  'listings.view', 'listings.moderate',
  'reports.view', 'reports.manage', 'reports.note', 'reports.export',
  'appeals.view', 'appeals.resolve', 'community.moderate', 'messages.investigate',
  'moderation.view', 'moderation.manage', 'config.view', 'categories.manage', 'university.manage',
  'settings.manage', 'roles.manage', 'audit.view', 'audit.export', 'deletions.view', 'deletions.process'
]) p
union all
select 'moderator'::public.app_role, p from unnest(array[
  'overview.view', 'analytics.view', 'users.view', 'users.restrict', 'listings.view', 'listings.moderate',
  'reports.view', 'reports.manage', 'reports.note', 'reports.export', 'appeals.view', 'appeals.resolve',
  'community.moderate', 'messages.investigate', 'moderation.view', 'config.view'
]) p
union all
select 'support_admin'::public.app_role, p from unnest(array[
  'overview.view', 'users.view', 'users.view_contact', 'listings.view', 'reports.view', 'reports.note',
  'appeals.view', 'config.view', 'deletions.view'
]) p
union all
select 'analyst'::public.app_role, p from unnest(array[
  'overview.view', 'analytics.view', 'analytics.export', 'reports.export', 'config.view'
]) p;

-- A suspended account holds no admin permissions.
create or replace function public.actor_has_permission(p_user uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null
    and exists (
      select 1 from public.user_roles r
      join public.admin_role_permissions rp on rp.role = r.role
      where r.user_id = p_user and rp.permission = p_permission
    )
    and not public.is_suspended(p_user);
$$;

create or replace function public.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.actor_has_permission(auth.uid(), p_permission);
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid())
    and not public.is_suspended(auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'super_admin')
    and not public.is_suspended(auth.uid());
$$;

create or replace function public.admin_assert(p_actor uuid, p_permission text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.actor_has_permission(p_actor, p_permission) then
    raise exception 'FORBIDDEN:%', p_permission;
  end if;
end;
$$;

-- The last active Super Admin can't be removed (prevents locking everyone out of the console).
create or replace function public.user_roles_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'super_admin' and (tg_op = 'DELETE' or new.role <> 'super_admin' or new.user_id <> old.user_id) then
    if not exists (
      select 1 from public.user_roles r
      where r.role = 'super_admin' and r.user_id <> old.user_id and not public.is_suspended(r.user_id)
    ) then
      raise exception 'LAST_SUPER_ADMIN';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger user_roles_guard before update or delete on public.user_roles
  for each row execute function public.user_roles_guard();

-- ---------------------------------------------------------------------------
-- Append-only records
-- ---------------------------------------------------------------------------
-- Rejects UPDATE/DELETE/TRUNCATE. The only permitted update is an ON DELETE SET NULL of one of the
-- reference columns named in the trigger arguments, so deleting an account still works.
create or replace function public.append_only_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_col text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_col in array tg_argv loop
      if v_new -> v_col = 'null'::jsonb then
        v_old := v_old - v_col;
        v_new := v_new - v_col;
      end if;
    end loop;
    if v_old = v_new then return new; end if;
  end if;
  raise exception 'APPEND_ONLY';
end;
$$;

alter table public.admin_audit_logs
  add column actor_roles text[] not null default '{}',
  add column outcome text not null default 'success' check (outcome in ('success', 'denied', 'failed')),
  add column metadata jsonb not null default '{}'::jsonb;
create index admin_audit_logs_actor_idx on public.admin_audit_logs (actor_id, created_at desc);
create index admin_audit_logs_action_idx on public.admin_audit_logs (action, created_at desc);

create trigger admin_audit_logs_append_only before update or delete on public.admin_audit_logs
  for each row execute function public.append_only_guard('actor_id');
create trigger admin_audit_logs_no_truncate before truncate on public.admin_audit_logs
  for each statement execute function public.append_only_guard('actor_id');
revoke update, delete, truncate on public.admin_audit_logs from service_role;

create trigger moderation_events_append_only before update or delete on public.moderation_events
  for each row execute function public.append_only_guard(
    'listing_id', 'subject_user_id', 'report_id', 'appeal_id', 'actor_id', 'forum_post_id', 'forum_comment_id'
  );
revoke update, delete, truncate on public.moderation_events from service_role;

alter table public.moderation_events drop constraint if exists moderation_events_action_check;
alter table public.moderation_events add constraint moderation_events_action_check check (action in (
  'auto_published', 'auto_limited', 'auto_blocked', 'report_auto_limited', 'expired',
  'admin_removed', 'admin_restored', 'admin_limited',
  'admin_restricted', 'admin_restriction_lifted',
  'report_in_review', 'report_dismissed', 'report_actioned', 'report_escalated', 'report_resolved',
  'report_reopened', 'report_assigned', 'report_priority_changed',
  'appeal_upheld', 'appeal_overturned',
  'conversation_restricted', 'conversation_unrestricted'
));

-- Every admin audit record goes through here (actor roles captured at the time of the action).
create or replace function public.admin_write_audit(
  p_actor uuid, p_action text, p_target_type text, p_target_id text,
  p_reason text default null, p_before jsonb default null, p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb, p_outcome text default 'success'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_logs (actor_id, actor_roles, action, target_type, target_id, reason, before, after, metadata, outcome)
  values (
    p_actor,
    coalesce((select array_agg(r.role::text order by r.role::text) from public.user_roles r where r.user_id = p_actor), '{}'),
    left(p_action, 80), left(p_target_type, 40), left(p_target_id, 120), left(p_reason, 1000),
    p_before, p_after, coalesce(p_metadata, '{}'::jsonb), coalesce(p_outcome, 'success')
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Per-actor rate limit over successful audited actions with the given prefix.
create or replace function public.admin_rate_limit(p_actor uuid, p_action_prefix text, p_limit integer, p_window interval)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.admin_audit_logs a
      where a.actor_id = p_actor and a.outcome = 'success' and a.created_at > now() - p_window
        and a.action like p_action_prefix || '%') >= p_limit then
    raise exception 'RATE_LIMITED:admin';
  end if;
end;
$$;

-- Records a staff member's attempt to use a permission they don't hold. Non-staff aren't logged.
create or replace function public.admin_record_denied(p_actor uuid, p_action text, p_permission text, p_target_type text default null, p_target_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.user_roles r where r.user_id = p_actor) then
    perform public.admin_write_audit(p_actor, p_action, coalesce(p_target_type, 'permission'), p_target_id, null, null, null,
      jsonb_build_object('permission', p_permission), 'denied');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports: triage fields, internal notes, reporter-only case view
-- ---------------------------------------------------------------------------
alter table public.reports
  add column priority smallint not null default 2 check (priority between 1 and 4),
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column assigned_at timestamptz,
  add column resolution_code text check (resolution_code is null or resolution_code in (
    'no_violation', 'content_removed', 'account_restricted', 'warning_issued', 'duplicate',
    'insufficient_evidence', 'referred', 'other'
  ));
create index reports_assignee_idx on public.reports (assigned_to, status) where assigned_to is not null;
create index reports_created_idx on public.reports (created_at desc);
update public.reports set priority = case severity when 3 then 3 when 1 then 1 else 2 end;

create or replace function public.reports_before_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.priority := case new.severity when 3 then 3 when 1 then 1 else 2 end;
  new.assigned_to := null;
  new.assigned_at := null;
  new.resolution_code := null;
  return new;
end;
$$;
create trigger reports_before_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

create table public.report_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  created_at timestamptz not null default now()
);
create index report_notes_report_idx on public.report_notes (report_id, created_at);
create trigger report_notes_append_only before update or delete on public.report_notes
  for each row execute function public.append_only_guard('author_id');

-- Reporters see their own cases only through this function: no priority, assignee, evidence or notes.
create or replace function public.my_report_cases(p_limit integer default 100)
returns table (
  id uuid, case_number text, target_type public.report_target, reason public.report_reason,
  status public.report_status, resolution_summary text, created_at timestamptz, resolved_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.case_number, r.target_type, r.reason, r.status, r.resolution_summary, r.created_at, r.resolved_at
  from public.reports r
  where r.reporter_id = auth.uid()
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- Conversations: restriction and audited investigation access
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column restricted_at timestamptz,
  add column restriction_reason text check (restriction_reason is null or char_length(restriction_reason) <= 500);

create table public.conversation_access_grants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index conversation_access_grants_actor_idx on public.conversation_access_grants (actor_id, conversation_id, expires_at desc);

create or replace function public.can_message(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and auth.uid() in (c.buyer_id, c.seller_id)
      and c.restricted_at is null
      and not public.is_blocked_between(c.buyer_id, c.seller_id)
  )
  and public.is_verified_student()
  and not public.has_active_restriction(auth.uid(), 'messaging_ban');
$$;

create or replace function public.messages_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  new.body := btrim(new.body);
  if new.kind <> 'system' then
    if exists (select 1 from public.conversations c where c.id = new.conversation_id and c.restricted_at is not null) then
      raise exception 'CONVERSATION_RESTRICTED';
    end if;
    if (select count(*) from public.messages m
        where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute')
       >= public.policy_int(array['rateLimits', 'messagesPerMinute'], 20) then
      raise exception 'RATE_LIMITED:messages';
    end if;
    if (select count(*) from public.messages m
        where m.sender_id = new.sender_id and m.created_at > now() - interval '1 day')
       >= public.policy_int(array['rateLimits', 'messagesPerDay'], 400) then
      raise exception 'RATE_LIMITED:messages';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform settings (each switch is enforced where noted)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key check (key in (
    'signups_paused',             -- handle_new_user()
    'listing_publishing_paused',  -- listing server actions (the only caller of persist_listing)
    'community_posting_paused',   -- community server actions
    'admin_session_max_hours'     -- console session age (src/lib/auth/admin.ts)
  )),
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('signups_paused', 'false'),
  ('listing_publishing_paused', 'false'),
  ('community_posting_paused', 'false'),
  ('admin_session_max_hours', '12');

create or replace function public.platform_flag(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value = 'true'::jsonb from public.platform_settings s where s.key = p_key), false);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_university uuid;
  v_name text;
  v_terms text;
begin
  if public.platform_flag('signups_paused') then
    raise exception 'SIGNUPS_PAUSED';
  end if;
  v_university := public.university_for_email(new.email);
  if v_university is null then
    raise exception 'EMAIL_DOMAIN_NOT_ALLOWED';
  end if;
  if coalesce(new.raw_user_meta_data ->> 'age_confirmed', 'false') <> 'true' then
    raise exception 'AGE_CONFIRMATION_REQUIRED';
  end if;
  v_terms := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');
  if v_terms is null then
    raise exception 'TERMS_ACCEPTANCE_REQUIRED';
  end if;

  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 50);
  if char_length(v_name) < 2 then
    v_name := 'Student';
  end if;

  insert into public.profiles (id, university_id, display_name, email_verified_at)
  values (new.id, v_university, v_name, new.email_confirmed_at);

  insert into public.profile_private (id, email_domain, age_confirmed_at, terms_version, terms_accepted_at)
  values (new.id, lower(split_part(new.email, '@', 2)), now(), v_terms, now());

  return new;
end;
$$;

alter table public.categories add constraint categories_icon_check check (icon ~ '^[a-z0-9-]{2,30}$');
alter table public.categories add constraint categories_description_check check (description is null or char_length(description) <= 300);

-- ---------------------------------------------------------------------------
-- Admin listing state (docs/ADMIN_DATA_BOUNDARIES.md §4)
-- ---------------------------------------------------------------------------
create or replace function public.admin_listing_state(p_status public.listing_status, p_moderation public.moderation_status, p_expires_at timestamptz)
returns text language sql stable set search_path = '' as $$
  select case
    when p_moderation = 'removed' or p_status = 'removed' then 'removed'
    when p_moderation = 'blocked' then 'blocked'
    when p_moderation = 'limited' then 'quarantined'
    when p_status = 'draft' then 'draft'
    when p_status = 'sold' then 'sold'
    when p_status = 'expired' or (p_expires_at is not null and p_expires_at <= now()) then 'expired'
    when p_status = 'on_hold' then 'reserved'
    else 'live'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Admin mutations (service_role only)
-- ---------------------------------------------------------------------------

-- Internal: report status transition + moderation event + audit. Callers have already authorized.
create or replace function public.admin_apply_report_status(
  p_actor uuid, p_report_id uuid, p_status public.report_status, p_code text, p_summary text, p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports;
  v_closed boolean := p_status in ('actioned', 'dismissed', 'resolved');
  v_was_closed boolean;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_report.status = p_status then return; end if;
  v_was_closed := v_report.status in ('actioned', 'dismissed', 'resolved');
  -- 'open' is only reachable by reopening a closed case.
  if p_status = 'open' and not v_was_closed then raise exception 'INVALID_TRANSITION'; end if;
  if v_closed and (p_code is null or char_length(btrim(coalesce(p_summary, ''))) < 3) then
    raise exception 'RESOLUTION_REQUIRED';
  end if;
  if v_was_closed and char_length(btrim(coalesce(p_reason, p_summary, ''))) < 3 then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.reports set
    status = p_status,
    resolution_code = case when v_closed then p_code else null end,
    resolution_summary = case when v_closed then btrim(p_summary) else null end,
    resolved_by = case when v_closed then p_actor else null end,
    resolved_at = case when v_closed then now() else null end
  where id = p_report_id;

  insert into public.moderation_events (report_id, listing_id, subject_user_id, action, source, actor_id, reason_codes, reason_text)
  values (
    p_report_id, v_report.listing_id, v_report.reported_user_id,
    case when v_was_closed and not v_closed then 'report_reopened' else 'report_' || p_status::text end,
    'admin', p_actor, case when p_code is null then '{}' else array[p_code] end, coalesce(p_summary, p_reason)
  );
  perform public.admin_write_audit(p_actor,
    case when v_was_closed and not v_closed then 'report.reopened' else 'report.' || p_status::text end,
    'report', p_report_id::text, coalesce(p_reason, p_summary),
    jsonb_build_object('status', v_report.status, 'resolution_code', v_report.resolution_code),
    jsonb_build_object('status', p_status, 'resolution_code', case when v_closed then p_code end),
    jsonb_build_object('case_number', v_report.case_number));
end;
$$;

create or replace function public.admin_update_report(p_actor uuid, p_report_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports;
  v_assignee uuid;
  v_priority smallint;
  v_status public.report_status;
begin
  perform public.admin_assert(p_actor, 'reports.manage');
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'INVALID_REQUEST'; end if;

  if p_patch ? 'priority' then
    v_priority := (p_patch ->> 'priority')::smallint;
    if v_priority is null or v_priority not between 1 and 4 then raise exception 'INVALID_REQUEST'; end if;
    if v_priority <> v_report.priority then
      update public.reports set priority = v_priority where id = p_report_id;
      insert into public.moderation_events (report_id, listing_id, subject_user_id, action, source, actor_id, metadata)
      values (p_report_id, v_report.listing_id, v_report.reported_user_id, 'report_priority_changed', 'admin', p_actor,
        jsonb_build_object('from', v_report.priority, 'to', v_priority));
      perform public.admin_write_audit(p_actor, 'report.priority', 'report', p_report_id::text, p_patch ->> 'reason',
        jsonb_build_object('priority', v_report.priority), jsonb_build_object('priority', v_priority),
        jsonb_build_object('case_number', v_report.case_number));
    end if;
  end if;

  if p_patch ? 'assigned_to' then
    v_assignee := nullif(p_patch ->> 'assigned_to', '')::uuid;
    if v_assignee is not null and not public.actor_has_permission(v_assignee, 'reports.view') then
      raise exception 'INVALID_ASSIGNEE';
    end if;
    if v_assignee is distinct from v_report.assigned_to then
      update public.reports set assigned_to = v_assignee, assigned_at = case when v_assignee is null then null else now() end
      where id = p_report_id;
      insert into public.moderation_events (report_id, listing_id, subject_user_id, action, source, actor_id, metadata)
      values (p_report_id, v_report.listing_id, v_report.reported_user_id, 'report_assigned', 'admin', p_actor,
        jsonb_build_object('assigned_to', v_assignee));
      perform public.admin_write_audit(p_actor, 'report.assigned', 'report', p_report_id::text, null,
        jsonb_build_object('assigned_to', v_report.assigned_to), jsonb_build_object('assigned_to', v_assignee),
        jsonb_build_object('case_number', v_report.case_number));
      -- Picking up an open case starts the investigation.
      if v_assignee is not null and v_report.status = 'open' and not (p_patch ? 'status') then
        perform public.admin_apply_report_status(p_actor, p_report_id, 'in_review', null, null);
      end if;
    end if;
  end if;

  if p_patch ? 'status' then
    v_status := (p_patch ->> 'status')::public.report_status;
    perform public.admin_apply_report_status(p_actor, p_report_id, v_status, p_patch ->> 'resolution_code', p_patch ->> 'summary', p_patch ->> 'reason');
  end if;
end;
$$;

create or replace function public.admin_add_report_note(p_actor uuid, p_report_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_case text;
begin
  perform public.admin_assert(p_actor, 'reports.note');
  perform public.admin_rate_limit(p_actor, 'report.note', 120, interval '1 hour');
  select case_number into v_case from public.reports where id = p_report_id;
  if v_case is null then raise exception 'NOT_FOUND'; end if;
  insert into public.report_notes (report_id, author_id, body) values (p_report_id, p_actor, btrim(p_body)) returning id into v_id;
  -- The note text stays in report_notes; the audit trail records that a note was added.
  perform public.admin_write_audit(p_actor, 'report.note_added', 'report', p_report_id::text, null, null, null,
    jsonb_build_object('case_number', v_case, 'note_id', v_id));
  return v_id;
end;
$$;

-- Quarantine (hide pending review), remove or restore up to 50 listings atomically.
create or replace function public.admin_moderate_listings(
  p_actor uuid, p_listing_ids uuid[], p_action text, p_reason text, p_reasons jsonb default '[]'::jsonb,
  p_report_id uuid default null, p_report_summary text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_listing public.listings;
  v_after public.listings;
  v_count integer := 0;
  v_size integer := coalesce(array_length(p_listing_ids, 1), 0);
  v_bulk boolean := coalesce(array_length(p_listing_ids, 1), 0) > 1;
  v_batch uuid := gen_random_uuid();
  v_rule text := 'p' || coalesce(public.active_policy_version()::text, '0') || '/admin';
  v_publish boolean;
begin
  perform public.admin_assert(p_actor, 'listings.moderate');
  if p_action not in ('quarantine', 'remove', 'restore') then raise exception 'INVALID_REQUEST'; end if;
  if v_size = 0 then raise exception 'NOTHING_SELECTED'; end if;
  if v_size > 50 then raise exception 'BULK_LIMIT'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if v_bulk then
    perform public.admin_rate_limit(p_actor, 'listing.bulk_', 10, interval '1 hour');
  end if;
  -- A linked report must be about one of these listings (it may be closed by this action).
  if p_report_id is not null and not exists (
    select 1 from public.reports r where r.id = p_report_id and r.listing_id = any(p_listing_ids)
  ) then
    raise exception 'REPORT_MISMATCH';
  end if;

  for v_listing in select * from public.listings where id = any(p_listing_ids) order by id for update loop
    continue when (p_action = 'remove' and v_listing.moderation_status = 'removed')
      or (p_action = 'restore' and v_listing.moderation_status in ('clear', 'unchecked'))
      or (p_action = 'quarantine' and v_listing.moderation_status in ('limited', 'removed', 'blocked'))
      -- A seller-deleted listing stays deleted.
      or (p_action = 'restore' and v_listing.status = 'removed');

    -- Restoring a listing that was blocked before it went live publishes it (no further approval).
    v_publish := p_action = 'restore' and v_listing.status = 'draft' and v_listing.moderation_status = 'blocked';
    update public.listings set
      moderation_status = case p_action when 'remove' then 'removed' when 'quarantine' then 'limited' else 'clear' end::public.moderation_status,
      moderation_source = 'admin',
      moderation_reasons = case when p_action = 'restore' then '[]'::jsonb else coalesce(p_reasons, '[]'::jsonb) end,
      moderation_rule_version = v_rule,
      status = case when v_publish then 'active'::public.listing_status else status end,
      published_at = case when v_publish then now() else published_at end,
      expires_at = case when v_publish then now() + make_interval(days => public.policy_int(array['listingExpiryDays'], 60)) else expires_at end
    where id = v_listing.id
    returning * into v_after;

    insert into public.moderation_events (listing_id, subject_user_id, report_id, action, source, actor_id, reason_text, rule_version, metadata)
    values (v_listing.id, v_listing.seller_id, p_report_id,
      case p_action when 'remove' then 'admin_removed' when 'quarantine' then 'admin_limited' else 'admin_restored' end,
      'admin', p_actor, btrim(p_reason), v_rule,
      case when v_bulk then jsonb_build_object('batch_id', v_batch, 'batch_size', v_size) else '{}'::jsonb end);
    perform public.admin_write_audit(p_actor, 'listing.' || p_action, 'listing', v_listing.id::text, btrim(p_reason),
      jsonb_build_object('status', v_listing.status, 'moderation_status', v_listing.moderation_status, 'moderation_source', v_listing.moderation_source),
      jsonb_build_object('status', v_after.status, 'moderation_status', v_after.moderation_status),
      jsonb_strip_nulls(jsonb_build_object('report_id', p_report_id, 'batch_id', case when v_bulk then v_batch end)));
    v_count := v_count + 1;
  end loop;

  if v_bulk then
    perform public.admin_write_audit(p_actor, 'listing.bulk_' || p_action, 'listing_batch', v_batch::text, btrim(p_reason), null, null,
      jsonb_build_object('requested', v_size, 'updated', v_count, 'listing_ids', to_jsonb(p_listing_ids)));
  end if;
  if p_report_id is not null and p_report_summary is not null and p_action = 'remove' then
    perform public.admin_apply_report_status(p_actor, p_report_id, 'actioned', 'content_removed', p_report_summary);
  end if;
  return v_count;
end;
$$;

create or replace function public.admin_restrict_user(
  p_actor uuid, p_user uuid, p_kind public.restriction_kind, p_reason text, p_duration_days integer default 0,
  p_report_id uuid default null, p_report_summary text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_expires timestamptz;
begin
  perform public.admin_assert(p_actor, 'users.restrict');
  if p_user = p_actor then raise exception 'CANNOT_TARGET_SELF'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.user_roles r where r.user_id = p_user)
     and not public.actor_has_permission(p_actor, 'roles.manage') then
    raise exception 'TARGET_IS_STAFF';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if coalesce(p_duration_days, 0) not between 0 and 3650 then raise exception 'INVALID_REQUEST'; end if;
  perform public.admin_rate_limit(p_actor, 'user.restrict.', 60, interval '1 hour');
  if p_report_id is not null and not exists (
    select 1 from public.reports r where r.id = p_report_id and r.reported_user_id = p_user
  ) then
    raise exception 'REPORT_MISMATCH';
  end if;

  v_expires := case when coalesce(p_duration_days, 0) > 0 then now() + make_interval(days => p_duration_days) end;
  insert into public.account_restrictions (user_id, kind, reason, expires_at, created_by)
  values (p_user, p_kind, btrim(p_reason), v_expires, p_actor)
  returning id into v_id;
  insert into public.moderation_events (subject_user_id, report_id, action, source, actor_id, reason_codes, reason_text, metadata)
  values (p_user, p_report_id, 'admin_restricted', 'admin', p_actor, array[p_kind::text], btrim(p_reason),
    jsonb_build_object('restriction_id', v_id, 'expires_at', v_expires));
  perform public.admin_write_audit(p_actor, 'user.restrict.' || p_kind::text, 'user', p_user::text, btrim(p_reason), null,
    jsonb_build_object('restriction_id', v_id, 'kind', p_kind, 'expires_at', v_expires),
    jsonb_strip_nulls(jsonb_build_object('report_id', p_report_id)));
  if p_report_id is not null and p_report_summary is not null then
    perform public.admin_apply_report_status(p_actor, p_report_id, 'actioned', 'account_restricted', p_report_summary);
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_lift_restriction(p_actor uuid, p_restriction_id uuid, p_reason text, p_appeal_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.account_restrictions;
begin
  if p_appeal_id is not null then
    perform public.admin_assert(p_actor, 'appeals.resolve');
  else
    perform public.admin_assert(p_actor, 'users.restrict');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_row from public.account_restrictions where id = p_restriction_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_row.lifted_at is not null then raise exception 'ALREADY_LIFTED'; end if;
  if v_row.user_id = p_actor then raise exception 'CANNOT_TARGET_SELF'; end if;
  update public.account_restrictions set lifted_at = now(), lifted_by = p_actor, lift_reason = btrim(p_reason) where id = p_restriction_id;
  insert into public.moderation_events (subject_user_id, appeal_id, action, source, actor_id, reason_codes, reason_text)
  values (v_row.user_id, p_appeal_id, 'admin_restriction_lifted', 'admin', p_actor, array[v_row.kind::text], btrim(p_reason));
  perform public.admin_write_audit(p_actor, 'user.restriction_lifted', 'user', v_row.user_id::text, btrim(p_reason),
    jsonb_build_object('restriction_id', v_row.id, 'kind', v_row.kind, 'expires_at', v_row.expires_at), null,
    jsonb_strip_nulls(jsonb_build_object('appeal_id', p_appeal_id)));
end;
$$;

create or replace function public.admin_resolve_appeal(p_actor uuid, p_appeal_id uuid, p_decision public.appeal_status, p_summary text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_appeal public.appeals;
begin
  perform public.admin_assert(p_actor, 'appeals.resolve');
  if p_decision not in ('upheld', 'overturned') then raise exception 'INVALID_REQUEST'; end if;
  if char_length(btrim(coalesce(p_summary, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_appeal from public.appeals where id = p_appeal_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_appeal.status <> 'open' then raise exception 'ALREADY_RESOLVED'; end if;
  if v_appeal.user_id = p_actor then raise exception 'CANNOT_TARGET_SELF'; end if;

  if p_decision = 'overturned' then
    if v_appeal.listing_id is not null then
      perform public.admin_moderate_listings(p_actor, array[v_appeal.listing_id], 'restore', 'Appeal ' || v_appeal.case_number || ': ' || btrim(p_summary));
    elsif v_appeal.restriction_id is not null
      and exists (select 1 from public.account_restrictions where id = v_appeal.restriction_id and lifted_at is null) then
      perform public.admin_lift_restriction(p_actor, v_appeal.restriction_id, 'Appeal ' || v_appeal.case_number || ': ' || btrim(p_summary), p_appeal_id);
    end if;
  end if;

  update public.appeals set status = p_decision, resolution_summary = btrim(p_summary), resolved_by = p_actor, resolved_at = now()
  where id = p_appeal_id;
  insert into public.moderation_events (appeal_id, listing_id, subject_user_id, action, source, actor_id, reason_text)
  values (p_appeal_id, v_appeal.listing_id, v_appeal.user_id, 'appeal_' || p_decision::text, 'admin', p_actor, btrim(p_summary));
  perform public.admin_write_audit(p_actor, 'appeal.' || p_decision::text, 'appeal', p_appeal_id::text, btrim(p_summary), null, null,
    jsonb_build_object('case_number', v_appeal.case_number));
end;
$$;

create or replace function public.admin_set_role(p_actor uuid, p_user uuid, p_role public.app_role, p_grant boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_before text[];
  v_after text[];
begin
  perform public.admin_assert(p_actor, 'roles.manage');
  if p_user = p_actor then raise exception 'CANNOT_TARGET_SELF'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  perform public.admin_rate_limit(p_actor, 'role.', 20, interval '1 hour');
  select coalesce(array_agg(role::text order by role::text), '{}') into v_before from public.user_roles where user_id = p_user;

  if p_grant then
    if not exists (select 1 from public.profiles p where p.id = p_user and p.email_verified_at is not null)
       or public.is_suspended(p_user) then
      raise exception 'TARGET_NOT_ELIGIBLE';
    end if;
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, p_actor)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;

  select coalesce(array_agg(role::text order by role::text), '{}') into v_after from public.user_roles where user_id = p_user;
  if v_before is distinct from v_after then
    perform public.admin_write_audit(p_actor, case when p_grant then 'role.granted' else 'role.revoked' end, 'user', p_user::text,
      btrim(p_reason), jsonb_build_object('roles', v_before), jsonb_build_object('roles', v_after), jsonb_build_object('role', p_role));
  end if;
end;
$$;

-- Investigating a reported conversation: a documented, time-limited, audited grant.
create or replace function public.admin_grant_conversation_access(p_actor uuid, p_conversation_id uuid, p_reason text, p_report_id uuid default null)
returns table (grant_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_conv public.conversations;
  v_id uuid;
  v_expires timestamptz := now() + interval '30 minutes';
begin
  perform public.admin_assert(p_actor, 'messages.investigate');
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_actor in (v_conv.buyer_id, v_conv.seller_id) then raise exception 'CANNOT_TARGET_SELF'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'REASON_REQUIRED'; end if;
  if p_report_id is not null and not exists (
    select 1 from public.reports r
    left join public.messages m on m.id = r.message_id
    where r.id = p_report_id
      and (m.conversation_id = p_conversation_id
        or (r.reported_user_id in (v_conv.buyer_id, v_conv.seller_id) and r.reporter_id in (v_conv.buyer_id, v_conv.seller_id)))
  ) then
    raise exception 'REPORT_MISMATCH';
  end if;
  perform public.admin_rate_limit(p_actor, 'conversation.access_granted', 30, interval '1 day');

  insert into public.conversation_access_grants (conversation_id, actor_id, report_id, reason, expires_at)
  values (p_conversation_id, p_actor, p_report_id, btrim(p_reason), v_expires)
  returning id into v_id;
  perform public.admin_write_audit(p_actor, 'conversation.access_granted', 'conversation', p_conversation_id::text, btrim(p_reason), null, null,
    jsonb_strip_nulls(jsonb_build_object('grant_id', v_id, 'report_id', p_report_id, 'expires_at', v_expires)));
  return query select v_id, v_expires;
end;
$$;

create or replace function public.admin_conversation_messages(p_actor uuid, p_conversation_id uuid)
returns table (id uuid, sender_id uuid, kind public.message_kind, body text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_grant uuid;
begin
  perform public.admin_assert(p_actor, 'messages.investigate');
  select g.id into v_grant from public.conversation_access_grants g
  where g.actor_id = p_actor and g.conversation_id = p_conversation_id and g.expires_at > now()
  order by g.expires_at desc limit 1;
  if v_grant is null then raise exception 'ACCESS_GRANT_REQUIRED'; end if;
  perform public.admin_write_audit(p_actor, 'conversation.messages_viewed', 'conversation', p_conversation_id::text, null, null, null,
    jsonb_build_object('grant_id', v_grant));
  return query
    select m.id, m.sender_id, m.kind, m.body, m.created_at
    from public.messages m where m.conversation_id = p_conversation_id
    order by m.created_at
    limit 500;
end;
$$;

create or replace function public.admin_restrict_conversation(p_actor uuid, p_conversation_id uuid, p_restrict boolean, p_reason text, p_report_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations;
begin
  perform public.admin_assert(p_actor, 'messages.investigate');
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_actor in (v_conv.buyer_id, v_conv.seller_id) then raise exception 'CANNOT_TARGET_SELF'; end if;
  if (v_conv.restricted_at is not null) = p_restrict then return; end if;
  update public.conversations set
    restricted_at = case when p_restrict then now() end,
    restriction_reason = case when p_restrict then left(btrim(p_reason), 500) end
  where id = p_conversation_id;
  insert into public.moderation_events (listing_id, report_id, action, source, actor_id, reason_text, metadata)
  values (v_conv.listing_id, p_report_id, case when p_restrict then 'conversation_restricted' else 'conversation_unrestricted' end,
    'admin', p_actor, btrim(p_reason), jsonb_build_object('conversation_id', p_conversation_id));
  perform public.admin_write_audit(p_actor, case when p_restrict then 'conversation.restricted' else 'conversation.unrestricted' end,
    'conversation', p_conversation_id::text, btrim(p_reason),
    jsonb_build_object('restricted', v_conv.restricted_at is not null), jsonb_build_object('restricted', p_restrict),
    jsonb_strip_nulls(jsonb_build_object('report_id', p_report_id)));
end;
$$;

-- Account email and sign-in data for support. Every lookup is audited; the email itself isn't logged.
create or replace function public.admin_user_contact(p_actor uuid, p_user uuid)
returns table (email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, auth_created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.admin_assert(p_actor, 'users.view_contact');
  perform public.admin_write_audit(p_actor, 'user.contact_viewed', 'user', p_user::text);
  return query select u.email::text, u.email_confirmed_at, u.last_sign_in_at, u.created_at from auth.users u where u.id = p_user;
end;
$$;

create or replace function public.admin_find_user_by_email(p_actor uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.admin_assert(p_actor, 'users.view_contact');
  select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_email));
  perform public.admin_write_audit(p_actor, 'user.searched_by_email', 'user', v_id::text, null, null, null,
    jsonb_build_object('domain', lower(split_part(p_email, '@', 2)), 'found', v_id is not null));
  return v_id;
end;
$$;

create or replace function public.admin_record_export(p_actor uuid, p_dataset text, p_permission text, p_rows integer, p_filters jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert(p_actor, p_permission);
  if p_dataset not in ('analytics_daily', 'reports', 'audit_logs', 'users') then raise exception 'INVALID_REQUEST'; end if;
  perform public.admin_rate_limit(p_actor, 'export.', 20, interval '1 hour');
  perform public.admin_write_audit(p_actor, 'export.' || p_dataset, 'export', p_dataset, null, null, null,
    jsonb_build_object('rows', p_rows, 'filters', coalesce(p_filters, '{}'::jsonb)));
end;
$$;

-- Categories ----------------------------------------------------------------
create or replace function public.admin_save_category(
  p_actor uuid, p_id uuid, p_slug text, p_name text, p_description text, p_icon text, p_is_ticket boolean, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.categories;
  v_new public.categories;
  v_in_use boolean;
begin
  perform public.admin_assert(p_actor, 'categories.manage');
  if p_id is null then
    insert into public.categories (slug, name, description, icon, is_ticket, is_active, sort_order)
    values (p_slug, btrim(p_name), nullif(btrim(p_description), ''), p_icon, coalesce(p_is_ticket, false), coalesce(p_is_active, true),
      coalesce((select max(sort_order) from public.categories), 0) + 10)
    returning * into v_new;
    perform public.admin_write_audit(p_actor, 'category.created', 'category', v_new.id::text, null, null,
      jsonb_build_object('slug', v_new.slug, 'name', v_new.name, 'icon', v_new.icon, 'is_ticket', v_new.is_ticket, 'is_active', v_new.is_active));
    return v_new.id;
  end if;

  select * into v_old from public.categories where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_in_use := exists (select 1 from public.listings l where l.category_id = p_id);
  if v_in_use and (p_slug <> v_old.slug or coalesce(p_is_ticket, v_old.is_ticket) <> v_old.is_ticket) then
    raise exception 'CATEGORY_IN_USE';
  end if;
  if v_old.is_active and not coalesce(p_is_active, true)
     and not exists (select 1 from public.categories c where c.is_active and c.id <> p_id) then
    raise exception 'LAST_ACTIVE_CATEGORY';
  end if;
  update public.categories set
    slug = p_slug, name = btrim(p_name), description = nullif(btrim(p_description), ''), icon = p_icon,
    is_ticket = coalesce(p_is_ticket, is_ticket), is_active = coalesce(p_is_active, is_active)
  where id = p_id
  returning * into v_new;
  perform public.admin_write_audit(p_actor, 'category.updated', 'category', p_id::text, null,
    jsonb_build_object('slug', v_old.slug, 'name', v_old.name, 'description', v_old.description, 'icon', v_old.icon, 'is_ticket', v_old.is_ticket, 'is_active', v_old.is_active),
    jsonb_build_object('slug', v_new.slug, 'name', v_new.name, 'description', v_new.description, 'icon', v_new.icon, 'is_ticket', v_new.is_ticket, 'is_active', v_new.is_active));
  return p_id;
end;
$$;

create or replace function public.admin_reorder_categories(p_actor uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
begin
  perform public.admin_assert(p_actor, 'categories.manage');
  if coalesce(array_length(p_ids, 1), 0) <> (select count(*) from public.categories)
     or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1)
     or exists (select 1 from unnest(p_ids) x where not exists (select 1 from public.categories c where c.id = x)) then
    raise exception 'INVALID_ORDER';
  end if;
  select jsonb_agg(c.slug order by c.sort_order, c.name) into v_before from public.categories c;
  update public.categories c set sort_order = o.ord * 10
  from unnest(p_ids) with ordinality as o(id, ord) where c.id = o.id;
  perform public.admin_write_audit(p_actor, 'category.reordered', 'category', null, null,
    jsonb_build_object('order', v_before),
    jsonb_build_object('order', (select jsonb_agg(c.slug order by c.sort_order, c.name) from public.categories c)));
end;
$$;

create or replace function public.admin_delete_category(p_actor uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.categories;
begin
  perform public.admin_assert(p_actor, 'categories.manage');
  select * into v_old from public.categories where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.listings l where l.category_id = p_id) then raise exception 'CATEGORY_IN_USE'; end if;
  if v_old.is_active and not exists (select 1 from public.categories c where c.is_active and c.id <> p_id) then
    raise exception 'LAST_ACTIVE_CATEGORY';
  end if;
  delete from public.categories where id = p_id;
  perform public.admin_write_audit(p_actor, 'category.deleted', 'category', p_id::text, null,
    jsonb_build_object('slug', v_old.slug, 'name', v_old.name), null);
end;
$$;

-- University, domains, meetup areas ---------------------------------------------
create or replace function public.admin_update_university(p_actor uuid, p_id uuid, p_name text, p_short_name text, p_city text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.universities;
begin
  perform public.admin_assert(p_actor, 'university.manage');
  select * into v_old from public.universities where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.universities set name = btrim(p_name), short_name = nullif(btrim(p_short_name), ''), city = nullif(btrim(p_city), '')
  where id = p_id;
  perform public.admin_write_audit(p_actor, 'university.updated', 'university', p_id::text, null,
    jsonb_build_object('name', v_old.name, 'short_name', v_old.short_name, 'city', v_old.city),
    jsonb_build_object('name', btrim(p_name), 'short_name', nullif(btrim(p_short_name), ''), 'city', nullif(btrim(p_city), '')));
end;
$$;

create or replace function public.admin_add_domain(p_actor uuid, p_university_id uuid, p_domain text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.admin_assert(p_actor, 'university.manage');
  insert into public.university_domains (university_id, domain, note)
  values (p_university_id, lower(btrim(p_domain)), nullif(btrim(p_note), ''))
  returning id into v_id;
  perform public.admin_write_audit(p_actor, 'domain.added', 'university_domain', lower(btrim(p_domain)), nullif(btrim(p_note), ''), null,
    jsonb_build_object('domain', lower(btrim(p_domain)), 'is_active', true), jsonb_build_object('university_id', p_university_id));
  return v_id;
end;
$$;

create or replace function public.admin_set_domain_active(p_actor uuid, p_domain_id uuid, p_active boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.university_domains;
begin
  perform public.admin_assert(p_actor, 'university.manage');
  select * into v_old from public.university_domains where id = p_domain_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old.is_active = p_active then return; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if not p_active and not exists (
    select 1 from public.university_domains d
    where d.university_id = v_old.university_id and d.is_active and d.id <> p_domain_id
  ) then
    raise exception 'LAST_ACTIVE_DOMAIN';
  end if;
  update public.university_domains set is_active = p_active where id = p_domain_id;
  perform public.admin_write_audit(p_actor, case when p_active then 'domain.activated' else 'domain.deactivated' end,
    'university_domain', v_old.domain, btrim(p_reason), jsonb_build_object('is_active', v_old.is_active), jsonb_build_object('is_active', p_active));
end;
$$;

create or replace function public.admin_add_meetup_area(p_actor uuid, p_university_id uuid, p_name text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.admin_assert(p_actor, 'university.manage');
  insert into public.meetup_areas (university_id, name, description, sort_order)
  values (p_university_id, btrim(p_name), nullif(btrim(p_description), ''),
    coalesce((select max(sort_order) from public.meetup_areas where university_id = p_university_id), 0) + 10)
  returning id into v_id;
  perform public.admin_write_audit(p_actor, 'meetup_area.added', 'meetup_area', v_id::text, null, null,
    jsonb_build_object('name', btrim(p_name), 'description', nullif(btrim(p_description), '')));
  return v_id;
end;
$$;

create or replace function public.admin_set_meetup_area_active(p_actor uuid, p_area_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.meetup_areas;
begin
  perform public.admin_assert(p_actor, 'university.manage');
  select * into v_old from public.meetup_areas where id = p_area_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old.is_active = p_active then return; end if;
  update public.meetup_areas set is_active = p_active where id = p_area_id;
  perform public.admin_write_audit(p_actor, case when p_active then 'meetup_area.activated' else 'meetup_area.deactivated' end,
    'meetup_area', p_area_id::text, null, jsonb_build_object('name', v_old.name, 'is_active', v_old.is_active), jsonb_build_object('is_active', p_active));
end;
$$;

-- Settings and policy ---------------------------------------------------------
create or replace function public.admin_set_setting(p_actor uuid, p_key text, p_value jsonb, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
begin
  perform public.admin_assert(p_actor, 'settings.manage');
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select value into v_old from public.platform_settings where key = p_key for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_key in ('signups_paused', 'listing_publishing_paused', 'community_posting_paused') then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'INVALID_REQUEST'; end if;
  elsif p_key = 'admin_session_max_hours' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not in (1, 2, 4, 8, 12, 24) then
      raise exception 'INVALID_REQUEST';
    end if;
  end if;
  if v_old = p_value then return; end if;
  update public.platform_settings set value = p_value, updated_by = p_actor, updated_at = now() where key = p_key;
  perform public.admin_write_audit(p_actor, 'setting.updated', 'setting', p_key, btrim(p_reason),
    jsonb_build_object('value', v_old), jsonb_build_object('value', p_value));
end;
$$;

-- The config is validated against the policy schema (Zod) by the server before this is called.
create or replace function public.admin_create_policy_version(p_actor uuid, p_config jsonb, p_note text, p_activate boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_version integer;
  v_id uuid;
begin
  perform public.admin_assert(p_actor, 'moderation.manage');
  if jsonb_typeof(p_config) <> 'object' or not (p_config ? 'rules') then raise exception 'INVALID_REQUEST'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('policy_versions'));
  select coalesce(max(version), 0) + 1 into v_version from public.policy_versions;
  insert into public.policy_versions (version, config, note, created_by, is_active)
  values (v_version, p_config, left(btrim(p_note), 500), p_actor, false)
  returning id into v_id;
  perform public.admin_write_audit(p_actor, 'policy.version_created', 'policy', v_version::text, btrim(p_note));
  if p_activate then perform public.admin_activate_policy(p_actor, v_id); end if;
  return v_version;
end;
$$;

create or replace function public.admin_activate_policy(p_actor uuid, p_policy_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_target public.policy_versions;
  v_current integer;
begin
  perform public.admin_assert(p_actor, 'moderation.manage');
  select * into v_target from public.policy_versions where id = p_policy_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_target.is_active then return v_target.version; end if;
  select version into v_current from public.policy_versions where is_active for update;
  -- Exactly one active version (partial unique index): deactivate first, in the same transaction.
  update public.policy_versions set is_active = false where is_active;
  update public.policy_versions set is_active = true where id = p_policy_id;
  perform public.admin_write_audit(p_actor, 'policy.activated', 'policy', v_target.version::text, null,
    jsonb_build_object('active_version', v_current), jsonb_build_object('active_version', v_target.version));
  return v_target.version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin reads (callable by authenticated; permission-checked inside)
-- ---------------------------------------------------------------------------
create or replace function public.admin_like_pattern(p_q text)
returns text language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

create or replace function public.admin_list_users(
  p_q text default null, p_status text default 'all', p_sort text default 'created_at', p_dir text default 'desc',
  p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, display_name text, university_name text, email_verified_at timestamptz, seller_enabled_at timestamptz,
  created_at timestamptz, restriction_kinds text[], roles text[], listing_count bigint, open_report_count bigint, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_desc boolean := lower(coalesce(p_dir, 'desc')) <> 'asc';
begin
  if not public.has_permission('users.view') then raise exception 'FORBIDDEN'; end if;
  return query
  with base as (
    select p.id, p.display_name, u.name as university_name, p.email_verified_at, p.seller_enabled_at, p.created_at,
      coalesce((select array_agg(distinct r.kind::text) from public.account_restrictions r
        where r.user_id = p.id and r.lifted_at is null and (r.expires_at is null or r.expires_at > now())), '{}') as restriction_kinds,
      coalesce((select array_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id = p.id), '{}') as roles,
      (select count(*) from public.listings l where l.seller_id = p.id) as listing_count,
      (select count(*) from public.reports rp where rp.reported_user_id = p.id and rp.status in ('open', 'in_review', 'escalated')) as open_report_count
    from public.profiles p
    join public.universities u on u.id = p.university_id
    where v_q is null or p.id::text = v_q or p.display_name ilike public.admin_like_pattern(v_q)
  ), filtered as (
    select * from base b
    where case coalesce(p_status, 'all')
      when 'verified' then b.email_verified_at is not null
      when 'unverified' then b.email_verified_at is null
      when 'sellers' then b.seller_enabled_at is not null
      when 'restricted' then cardinality(b.restriction_kinds) > 0
      when 'suspended' then 'suspension' = any(b.restriction_kinds)
      when 'staff' then cardinality(b.roles) > 0
      else true end
  )
  select f.*, count(*) over () from filtered f
  order by
    case when p_sort = 'display_name' and not v_desc then lower(f.display_name) end asc,
    case when p_sort = 'display_name' and v_desc then lower(f.display_name) end desc,
    case when p_sort = 'listings' and not v_desc then f.listing_count end asc,
    case when p_sort = 'listings' and v_desc then f.listing_count end desc,
    case when p_sort = 'reports' and not v_desc then f.open_report_count end asc,
    case when p_sort = 'reports' and v_desc then f.open_report_count end desc,
    case when not v_desc then f.created_at end asc,
    f.created_at desc, f.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_list_listings(
  p_q text default null, p_state text default 'all', p_category text default null, p_signal text default null,
  p_sort text default 'updated_at', p_dir text default 'desc', p_limit integer default 25, p_offset integer default 0,
  p_seller uuid default null
) returns table (
  id uuid, title text, price_inr integer, condition public.item_condition, status public.listing_status,
  moderation_status public.moderation_status, moderation_source public.moderation_source, admin_state text,
  category_name text, category_slug text, seller_id uuid, seller_name text, created_at timestamptz, updated_at timestamptz,
  published_at timestamptz, open_report_count bigint, reason_codes text[], thumb_path text, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_desc boolean := lower(coalesce(p_dir, 'desc')) <> 'asc';
begin
  if not public.has_permission('listings.view') then raise exception 'FORBIDDEN'; end if;
  return query
  with base as (
    select l.id, l.title, l.price_inr, l.condition, l.status, l.moderation_status, l.moderation_source,
      public.admin_listing_state(l.status, l.moderation_status, l.expires_at) as admin_state,
      c.name as category_name, c.slug as category_slug, l.seller_id, p.display_name as seller_name,
      l.created_at, l.updated_at, l.published_at,
      (select count(*) from public.reports r where r.listing_id = l.id and r.status in ('open', 'in_review', 'escalated')) as open_report_count,
      array(select x ->> 'code' from jsonb_array_elements(l.moderation_reasons) x where x ? 'code') as reason_codes,
      (select i.thumb_path from public.listing_images i where i.listing_id = l.id order by i.position limit 1) as thumb_path
    from public.listings l
    join public.categories c on c.id = l.category_id
    join public.profiles p on p.id = l.seller_id
    where (v_q is null or l.id::text = v_q or l.title ilike public.admin_like_pattern(v_q) or p.display_name ilike public.admin_like_pattern(v_q))
      and (p_category is null or c.slug = p_category)
      and (p_seller is null or l.seller_id = p_seller)
  ), filtered as (
    select * from base b
    where (coalesce(p_state, 'all') = 'all'
        or (p_state = 'flagged' and b.open_report_count > 0)
        or b.admin_state = p_state)
      and (p_signal is null or p_signal = any(b.reason_codes))
  )
  select f.*, count(*) over () from filtered f
  order by
    case when p_sort = 'price' and not v_desc then f.price_inr end asc,
    case when p_sort = 'price' and v_desc then f.price_inr end desc,
    case when p_sort = 'reports' and not v_desc then f.open_report_count end asc,
    case when p_sort = 'reports' and v_desc then f.open_report_count end desc,
    case when p_sort = 'created_at' and not v_desc then f.created_at end asc,
    case when p_sort = 'created_at' and v_desc then f.created_at end desc,
    case when coalesce(p_sort, 'updated_at') not in ('price', 'reports', 'created_at') and not v_desc then f.updated_at end asc,
    f.updated_at desc, f.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_list_reports(
  p_q text default null, p_status text default 'active', p_priority integer default null, p_severity integer default null,
  p_reason text default null, p_target text default null, p_assignee text default null,
  p_sort text default 'priority', p_dir text default 'desc', p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, case_number text, target_type public.report_target, reason public.report_reason, severity smallint, priority smallint,
  status public.report_status, created_at timestamptz, updated_at timestamptz, resolved_at timestamptz,
  assigned_to uuid, assignee_name text, reporter_name text, target_label text, listing_id uuid, reported_user_id uuid,
  resolution_code text, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_desc boolean := lower(coalesce(p_dir, 'desc')) <> 'asc';
  v_assignee uuid;
begin
  if not public.has_permission('reports.view') then raise exception 'FORBIDDEN'; end if;
  if p_assignee = 'me' then v_assignee := auth.uid();
  elsif p_assignee ~ '^[0-9a-fA-F-]{36}$' then v_assignee := p_assignee::uuid;
  end if;
  return query
  with filtered as (
    select r.id, r.case_number, r.target_type, r.reason, r.severity, r.priority, r.status, r.created_at, r.updated_at, r.resolved_at,
      r.assigned_to, a.display_name as assignee_name, rep.display_name as reporter_name,
      coalesce(l.title, fp.title, ru.display_name) as target_label, r.listing_id, r.reported_user_id, r.resolution_code
    from public.reports r
    left join public.profiles a on a.id = r.assigned_to
    left join public.profiles rep on rep.id = r.reporter_id
    left join public.profiles ru on ru.id = r.reported_user_id
    left join public.listings l on l.id = r.listing_id
    left join public.forum_posts fp on fp.id = r.post_id
    where (v_q is null or r.case_number ilike public.admin_like_pattern(v_q) or r.id::text = v_q)
      and case coalesce(p_status, 'active')
        when 'active' then r.status in ('open', 'in_review', 'escalated')
        when 'closed' then r.status in ('actioned', 'dismissed', 'resolved')
        when 'all' then true
        else r.status::text = p_status end
      and (p_priority is null or r.priority = p_priority)
      and (p_severity is null or r.severity = p_severity)
      and (p_reason is null or r.reason::text = p_reason)
      and (p_target is null or r.target_type::text = p_target)
      and (p_assignee is null or (p_assignee = 'unassigned' and r.assigned_to is null) or r.assigned_to = v_assignee)
  )
  select f.*, count(*) over () from filtered f
  order by
    case when p_sort = 'created_at' and not v_desc then f.created_at end asc,
    case when p_sort = 'created_at' and v_desc then f.created_at end desc,
    case when p_sort = 'updated_at' and not v_desc then f.updated_at end asc,
    case when p_sort = 'updated_at' and v_desc then f.updated_at end desc,
    case when p_sort = 'severity' and not v_desc then f.severity end asc,
    case when p_sort = 'severity' and v_desc then f.severity end desc,
    case when coalesce(p_sort, 'priority') not in ('created_at', 'updated_at', 'severity') and not v_desc then f.priority end asc,
    case when coalesce(p_sort, 'priority') not in ('created_at', 'updated_at', 'severity') and v_desc then f.priority end desc,
    f.severity desc, f.created_at asc, f.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Conversation metadata only (no message text) for investigation search.
create or replace function public.admin_search_conversations(p_q text, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, listing_id uuid, listing_title text, buyer_id uuid, buyer_name text, seller_id uuid, seller_name text,
  created_at timestamptz, last_message_at timestamptz, message_count bigint, report_count bigint, restricted_at timestamptz,
  total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_uuid uuid;
  v_report public.reports;
begin
  if not public.has_permission('messages.investigate') then raise exception 'FORBIDDEN'; end if;
  if v_q is null then return; end if;
  if v_q ~ '^[0-9a-fA-F-]{36}$' then v_uuid := v_q::uuid; end if;
  if v_q ~* '^R-[0-9]{1,9}$' then
    select * into v_report from public.reports r where upper(r.case_number) = upper(v_q);
    if not found then return; end if;
  end if;
  return query
  with matched as (
    select c.* from public.conversations c
    where (v_uuid is not null and (c.id = v_uuid or c.buyer_id = v_uuid or c.seller_id = v_uuid))
       or (v_report.id is not null and (
            c.id = (select m.conversation_id from public.messages m where m.id = v_report.message_id)
            or (v_report.reporter_id in (c.buyer_id, c.seller_id) and v_report.reported_user_id in (c.buyer_id, c.seller_id))))
  )
  select c.id, c.listing_id, l.title, c.buyer_id, b.display_name, c.seller_id, s.display_name, c.created_at, c.last_message_at,
    (select count(*) from public.messages m where m.conversation_id = c.id),
    (select count(*) from public.reports r join public.messages m on m.id = r.message_id where m.conversation_id = c.id),
    c.restricted_at,
    count(*) over ()
  from matched c
  join public.listings l on l.id = c.listing_id
  join public.profiles b on b.id = c.buyer_id
  join public.profiles s on s.id = c.seller_id
  order by c.last_message_at desc nulls last, c.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Overview dashboard: current snapshot + activity in the selected range (local calendar days).
create or replace function public.admin_overview(p_from date, p_to date, p_tz text default 'Asia/Kolkata')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.has_permission('overview.view') then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 366 then raise exception 'RANGE_TOO_LONG'; end if;
  v_start := p_from::timestamp at time zone p_tz;
  v_end := (p_to + 1)::timestamp at time zone p_tz;

  return jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'tz', p_tz),
    'students', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'verified', (select count(*) from public.profiles where email_verified_at is not null),
      'sellers', (select count(*) from public.profiles where seller_enabled_at is not null),
      'new_in_range', (select count(*) from public.profiles where created_at >= v_start and created_at < v_end),
      'verified_in_range', (select count(*) from public.profiles where email_verified_at >= v_start and email_verified_at < v_end)
    ),
    'listings', (
      select jsonb_build_object(
        'live', count(*) filter (where s = 'live'),
        'reserved', count(*) filter (where s = 'reserved'),
        'sold', count(*) filter (where s = 'sold'),
        'expired', count(*) filter (where s = 'expired'),
        'draft', count(*) filter (where s = 'draft'),
        'quarantined', count(*) filter (where s = 'quarantined'),
        'blocked', count(*) filter (where s = 'blocked'),
        'removed', count(*) filter (where s = 'removed'),
        'flagged', (select count(distinct r.listing_id) from public.reports r where r.listing_id is not null and r.status in ('open', 'in_review', 'escalated')),
        'created_in_range', (select count(*) from public.listings where created_at >= v_start and created_at < v_end),
        'published_in_range', (select count(*) from public.listings where published_at >= v_start and published_at < v_end)
      )
      from (select public.admin_listing_state(l.status, l.moderation_status, l.expires_at) as s from public.listings l) x
    ),
    'conversations', jsonb_build_object(
      'total', (select count(*) from public.conversations),
      'in_range', (select count(*) from public.conversations where created_at >= v_start and created_at < v_end)
    ),
    'reports', (
      select jsonb_build_object(
        'open', count(*) filter (where status = 'open'),
        'in_review', count(*) filter (where status = 'in_review'),
        'escalated', count(*) filter (where status = 'escalated'),
        'actioned', count(*) filter (where status = 'actioned'),
        'dismissed', count(*) filter (where status = 'dismissed'),
        'resolved', count(*) filter (where status = 'resolved'),
        'urgent_open', count(*) filter (where status in ('open', 'in_review', 'escalated') and priority >= 3),
        'unassigned_open', count(*) filter (where status in ('open', 'in_review', 'escalated') and assigned_to is null),
        'in_range', count(*) filter (where created_at >= v_start and created_at < v_end),
        'reported_listings_open', count(distinct listing_id) filter (where status in ('open', 'in_review', 'escalated') and target_type = 'listing'),
        'reported_users_open', count(distinct reported_user_id) filter (where status in ('open', 'in_review', 'escalated') and target_type = 'user')
      ) from public.reports
    ),
    'safety', jsonb_build_object(
      'active_restrictions', (select count(*) from public.account_restrictions where lifted_at is null and (expires_at is null or expires_at > now())),
      'active_suspensions', (select count(*) from public.account_restrictions where kind = 'suspension' and lifted_at is null and (expires_at is null or expires_at > now())),
      'open_appeals', (select count(*) from public.appeals where status = 'open'),
      'pending_deletions', (select count(*) from public.account_deletion_requests where status = 'pending')
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'registrations', coalesce(reg.n, 0), 'listings', coalesce(lst.n, 0), 'reports', coalesce(rep.n, 0)) order by d.day), '[]'::jsonb)
      from (select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g) d
      left join (select (created_at at time zone p_tz)::date as day, count(*) as n from public.profiles where created_at >= v_start and created_at < v_end group by 1) reg on reg.day = d.day
      left join (select (created_at at time zone p_tz)::date as day, count(*) as n from public.listings where created_at >= v_start and created_at < v_end group by 1) lst on lst.day = d.day
      left join (select (created_at at time zone p_tz)::date as day, count(*) as n from public.reports where created_at >= v_start and created_at < v_end group by 1) rep on rep.day = d.day
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'is_active', c.is_active, 'live', coalesce(x.live, 0), 'total', coalesce(x.total, 0)) order by coalesce(x.live, 0) desc, c.sort_order), '[]'::jsonb)
      from public.categories c
      left join (
        select l.category_id,
          count(*) filter (where public.admin_listing_state(l.status, l.moderation_status, l.expires_at) = 'live') as live,
          count(*) as total
        from public.listings l group by l.category_id
      ) x on x.category_id = c.id
    )
  );
end;
$$;

-- Analytics: aggregates only. Metrics that aren't tracked are reported as such (see "tracking").
create or replace function public.admin_analytics(p_from date, p_to date, p_tz text default 'Asia/Kolkata')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.has_permission('analytics.view') then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 366 then raise exception 'RANGE_TOO_LONG'; end if;
  v_start := p_from::timestamp at time zone p_tz;
  v_end := (p_to + 1)::timestamp at time zone p_tz;

  return jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'tz', p_tz),
    'tracking', jsonb_build_object(
      'search_events', exists (select 1 from public.analytics_events where name = 'search_submitted'),
      'listing_view_events', exists (select 1 from public.analytics_events where name = 'listing_viewed'),
      'first_search_event_at', (select min(created_at) from public.analytics_events where name = 'search_submitted')
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'registrations', coalesce(reg.n, 0), 'verifications', coalesce(ver.n, 0),
        'listings_created', coalesce(lc.n, 0), 'listings_published', coalesce(lp.n, 0), 'listings_sold', coalesce(ls.n, 0),
        'conversations', coalesce(cv.n, 0), 'reports', coalesce(rp.n, 0),
        'searches', coalesce(se.n, 0), 'zero_result_searches', coalesce(se.z, 0), 'listing_views', coalesce(lv.n, 0)
      ) order by d.day), '[]'::jsonb)
      from (select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g) d
      left join (select (created_at at time zone p_tz)::date as day, count(*) n from public.profiles where created_at >= v_start and created_at < v_end group by 1) reg on reg.day = d.day
      left join (select (email_verified_at at time zone p_tz)::date as day, count(*) n from public.profiles where email_verified_at >= v_start and email_verified_at < v_end group by 1) ver on ver.day = d.day
      left join (select (created_at at time zone p_tz)::date as day, count(*) n from public.listings where created_at >= v_start and created_at < v_end group by 1) lc on lc.day = d.day
      left join (select (published_at at time zone p_tz)::date as day, count(*) n from public.listings where published_at >= v_start and published_at < v_end group by 1) lp on lp.day = d.day
      left join (select (sold_at at time zone p_tz)::date as day, count(*) n from public.listings where sold_at >= v_start and sold_at < v_end group by 1) ls on ls.day = d.day
      left join (select (created_at at time zone p_tz)::date as day, count(*) n from public.conversations where created_at >= v_start and created_at < v_end group by 1) cv on cv.day = d.day
      left join (select (created_at at time zone p_tz)::date as day, count(*) n from public.reports where created_at >= v_start and created_at < v_end group by 1) rp on rp.day = d.day
      left join (select (created_at at time zone p_tz)::date as day, count(*) n, count(*) filter (where properties ->> 'zero_results' = 'true') z
                 from public.analytics_events where name = 'search_submitted' and created_at >= v_start and created_at < v_end group by 1) se on se.day = d.day
      left join (select (created_at at time zone p_tz)::date as day, count(*) n
                 from public.analytics_events where name = 'listing_viewed' and created_at >= v_start and created_at < v_end group by 1) lv on lv.day = d.day
    ),
    'verification', jsonb_build_object(
      'registered_in_range', (select count(*) from public.profiles where created_at >= v_start and created_at < v_end),
      'verified_of_registered', (select count(*) from public.profiles where created_at >= v_start and created_at < v_end and email_verified_at is not null),
      'unverified_older_than_72h', (select count(*) from public.profiles where email_verified_at is null and created_at < now() - interval '72 hours')
    ),
    'listings_now', (
      select jsonb_build_object(
        'live', count(*) filter (where s = 'live'), 'reserved', count(*) filter (where s = 'reserved'),
        'sold', count(*) filter (where s = 'sold'), 'quarantined', count(*) filter (where s = 'quarantined'))
      from (select public.admin_listing_state(l.status, l.moderation_status, l.expires_at) as s from public.listings l) x
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'name', c.name,
        'created', (select count(*) from public.listings l where l.category_id = c.id and l.created_at >= v_start and l.created_at < v_end),
        'sold', (select count(*) from public.listings l where l.category_id = c.id and l.sold_at >= v_start and l.sold_at < v_end),
        'conversations', (select count(*) from public.conversations cv join public.listings l on l.id = cv.listing_id
                          where l.category_id = c.id and cv.created_at >= v_start and cv.created_at < v_end),
        'live', (select count(*) from public.listings l where l.category_id = c.id
                 and public.admin_listing_state(l.status, l.moderation_status, l.expires_at) = 'live')
      ) order by c.sort_order), '[]'::jsonb)
      from public.categories c
    ),
    'reports_by_reason', (
      select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n, 'high', h) order by n desc), '[]'::jsonb)
      from (select reason::text, count(*) n, count(*) filter (where severity = 3) h from public.reports
            where created_at >= v_start and created_at < v_end group by reason) x
    ),
    'reports_by_severity', (
      select coalesce(jsonb_object_agg(severity::text, n), '{}'::jsonb)
      from (select severity, count(*) n from public.reports where created_at >= v_start and created_at < v_end group by severity) x
    ),
    'resolution', (
      select jsonb_build_object(
        'closed', count(*),
        'median_hours', round((percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at) / 3600))::numeric, 1),
        'p90_hours', round((percentile_cont(0.9) within group (order by extract(epoch from resolved_at - created_at) / 3600))::numeric, 1)
      ) from public.reports where resolved_at >= v_start and resolved_at < v_end
    ),
    'first_response', (
      select jsonb_build_object(
        'responded', count(*),
        'median_hours', round((percentile_cont(0.5) within group (order by hours))::numeric, 1)
      )
      from (
        select extract(epoch from min(e.created_at) - r.created_at) / 3600 as hours
        from public.reports r join public.moderation_events e on e.report_id = r.id and e.source = 'admin'
        where r.created_at >= v_start and r.created_at < v_end group by r.id, r.created_at
      ) x
    ),
    'moderation', (
      select coalesce(jsonb_object_agg(action, n), '{}'::jsonb)
      from (select action, count(*) n from public.moderation_events where created_at >= v_start and created_at < v_end group by action) x
    ),
    'enforcement', jsonb_build_object(
      'active_suspensions', (select count(*) from public.account_restrictions where kind = 'suspension' and lifted_at is null and (expires_at is null or expires_at > now())),
      'new_restrictions', (select count(*) from public.account_restrictions where created_at >= v_start and created_at < v_end),
      'new_suspensions', (select count(*) from public.account_restrictions where kind = 'suspension' and created_at >= v_start and created_at < v_end),
      'repeat_violators', (
        select count(*) from (
          select e.subject_user_id from public.moderation_events e
          where e.subject_user_id is not null and e.created_at >= v_start and e.created_at < v_end
            and e.action in ('auto_blocked', 'admin_removed', 'admin_restricted', 'report_auto_limited')
          group by e.subject_user_id having count(*) >= 2
        ) x
      ),
      'appeals_submitted', (select count(*) from public.appeals where created_at >= v_start and created_at < v_end),
      'appeals_overturned', (select count(*) from public.appeals where status = 'overturned' and resolved_at >= v_start and resolved_at < v_end),
      'appeals_upheld', (select count(*) from public.appeals where status = 'upheld' and resolved_at >= v_start and resolved_at < v_end)
    )
  );
end;
$$;

-- Existing 7-day metrics RPC: now permission-checked.
create or replace function public.admin_metrics(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
begin
  if not public.has_permission('overview.view') then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'window_days', greatest(1, least(coalesce(p_days, 7), 90)),
    'verified_users', (select count(*) from public.profiles where email_verified_at is not null),
    'new_verified_users', (select count(*) from public.profiles where email_verified_at >= v_since),
    'active_listings', (select count(*) from public.listings
      where status = 'active' and moderation_status = 'clear' and (expires_at is null or expires_at > now())),
    'listings_published', (select count(*) from public.moderation_events where action = 'auto_published' and created_at >= v_since),
    'successful_connections', (
      select count(*) from public.conversations c
      where exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = c.buyer_id and m.created_at >= v_since)
        and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = c.seller_id and m.created_at >= v_since)
    ),
    'open_reports', (select count(*) from public.reports where status in ('open', 'in_review', 'escalated'))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: from "any staff" to specific permissions
-- ---------------------------------------------------------------------------
revoke all on public.admin_role_permissions, public.report_notes, public.conversation_access_grants, public.platform_settings
  from anon, authenticated;
grant all on public.admin_role_permissions, public.report_notes, public.conversation_access_grants, public.platform_settings
  to service_role;
revoke update, delete, truncate on public.report_notes from service_role;
alter table public.admin_role_permissions enable row level security;
alter table public.report_notes enable row level security;
alter table public.conversation_access_grants enable row level security;
alter table public.platform_settings enable row level security;

grant select on public.report_notes to authenticated;
create policy report_notes_read on public.report_notes
  for select to authenticated using (public.has_permission('reports.view'));

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.has_permission('users.view')
    or (public.is_verified_student() and university_id = public.current_university_id())
  );

drop policy user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.view') or public.has_permission('roles.manage'));

drop policy account_restrictions_read on public.account_restrictions;
create policy account_restrictions_read on public.account_restrictions
  for select to authenticated using (user_id = auth.uid() or public.has_permission('users.view'));

drop policy policy_versions_staff on public.policy_versions;
create policy policy_versions_read on public.policy_versions
  for select to authenticated using (public.has_permission('moderation.view'));

drop policy listings_read on public.listings;
create policy listings_read on public.listings
  for select to authenticated
  using (
    seller_id = auth.uid()
    or public.has_permission('listings.view')
    or (
      public.is_verified_student()
      and university_id = public.current_university_id()
      and moderation_status = 'clear'
      and status in ('active', 'on_hold', 'sold', 'expired')
      and not public.is_suspended(seller_id)
    )
    or exists (select 1 from public.conversations c where c.listing_id = listings.id and c.buyer_id = auth.uid())
  );

drop policy listing_images_read on public.listing_images;
create policy listing_images_read on public.listing_images
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.has_permission('listings.view')
    or (listing_id is not null and exists (select 1 from public.listings l where l.id = listing_images.listing_id))
  );

drop policy listing_declarations_read on public.listing_declarations;
create policy listing_declarations_read on public.listing_declarations
  for select to authenticated using (seller_id = auth.uid() or public.has_permission('listings.view'));

-- Reporters use my_report_cases(); the table itself is staff-only.
drop policy reports_read on public.reports;
create policy reports_read on public.reports
  for select to authenticated using (public.has_permission('reports.view'));

drop policy appeals_read on public.appeals;
create policy appeals_read on public.appeals
  for select to authenticated using (user_id = auth.uid() or public.has_permission('appeals.view'));

drop policy moderation_events_staff on public.moderation_events;
create policy moderation_events_read on public.moderation_events
  for select to authenticated
  using (public.has_permission('listings.view') or public.has_permission('users.view') or public.has_permission('moderation.view'));

drop policy admin_audit_logs_staff on public.admin_audit_logs;
create policy admin_audit_logs_read on public.admin_audit_logs
  for select to authenticated using (public.has_permission('audit.view'));

drop policy deletion_requests_read on public.account_deletion_requests;
create policy deletion_requests_read on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid() or public.has_permission('deletions.view'));

drop policy analytics_events_staff on public.analytics_events;
create policy analytics_events_read on public.analytics_events
  for select to authenticated using (public.has_permission('analytics.view'));

drop policy forum_posts_read on public.forum_posts;
create policy forum_posts_read on public.forum_posts
  for select to authenticated
  using (
    author_id = auth.uid()
    or public.has_permission('community.moderate')
    or (
      public.is_verified_student()
      and university_id = public.current_university_id()
      and (moderation_status in ('clear', 'removed') or deleted_at is not null)
    )
  );

drop policy forum_comments_read on public.forum_comments;
create policy forum_comments_read on public.forum_comments
  for select to authenticated
  using (
    exists (select 1 from public.forum_posts p where p.id = forum_comments.post_id)
    and (
      moderation_status in ('clear', 'removed')
      or deleted_at is not null
      or author_id = auth.uid()
      or public.has_permission('community.moderate')
    )
  );

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.actor_has_permission(uuid, text), public.has_permission(text), public.admin_assert(uuid, text),
  public.user_roles_guard(), public.append_only_guard(), public.admin_write_audit(uuid, text, text, text, text, jsonb, jsonb, jsonb, text),
  public.admin_rate_limit(uuid, text, integer, interval), public.admin_record_denied(uuid, text, text, text, text),
  public.reports_before_insert(), public.my_report_cases(integer), public.platform_flag(text), public.admin_listing_state(public.listing_status, public.moderation_status, timestamptz),
  public.admin_apply_report_status(uuid, uuid, public.report_status, text, text, text),
  public.admin_update_report(uuid, uuid, jsonb), public.admin_add_report_note(uuid, uuid, text),
  public.admin_moderate_listings(uuid, uuid[], text, text, jsonb, uuid, text),
  public.admin_restrict_user(uuid, uuid, public.restriction_kind, text, integer, uuid, text),
  public.admin_lift_restriction(uuid, uuid, text, uuid), public.admin_resolve_appeal(uuid, uuid, public.appeal_status, text),
  public.admin_set_role(uuid, uuid, public.app_role, boolean, text),
  public.admin_grant_conversation_access(uuid, uuid, text, uuid), public.admin_conversation_messages(uuid, uuid),
  public.admin_restrict_conversation(uuid, uuid, boolean, text, uuid),
  public.admin_user_contact(uuid, uuid), public.admin_find_user_by_email(uuid, text),
  public.admin_record_export(uuid, text, text, integer, jsonb),
  public.admin_save_category(uuid, uuid, text, text, text, text, boolean, boolean), public.admin_reorder_categories(uuid, uuid[]),
  public.admin_delete_category(uuid, uuid), public.admin_update_university(uuid, uuid, text, text, text),
  public.admin_add_domain(uuid, uuid, text, text), public.admin_set_domain_active(uuid, uuid, boolean, text),
  public.admin_add_meetup_area(uuid, uuid, text, text), public.admin_set_meetup_area_active(uuid, uuid, boolean),
  public.admin_set_setting(uuid, text, jsonb, text), public.admin_create_policy_version(uuid, jsonb, text, boolean),
  public.admin_activate_policy(uuid, uuid), public.admin_like_pattern(text),
  public.admin_list_users(text, text, text, text, integer, integer),
  public.admin_list_listings(text, text, text, text, text, text, integer, integer, uuid),
  public.admin_list_reports(text, text, integer, integer, text, text, text, text, text, integer, integer),
  public.admin_search_conversations(text, integer, integer),
  public.admin_overview(date, date, text), public.admin_analytics(date, date, text)
from public, anon, authenticated;

-- Internal helper: only reachable from inside the admin_* functions (which run as the owner).
revoke execute on function public.admin_apply_report_status(uuid, uuid, public.report_status, text, text, text) from service_role;

grant execute on function
  public.actor_has_permission(uuid, text), public.admin_assert(uuid, text), public.admin_write_audit(uuid, text, text, text, text, jsonb, jsonb, jsonb, text),
  public.admin_rate_limit(uuid, text, integer, interval), public.admin_record_denied(uuid, text, text, text, text), public.platform_flag(text),
  public.admin_update_report(uuid, uuid, jsonb), public.admin_add_report_note(uuid, uuid, text),
  public.admin_moderate_listings(uuid, uuid[], text, text, jsonb, uuid, text),
  public.admin_restrict_user(uuid, uuid, public.restriction_kind, text, integer, uuid, text),
  public.admin_lift_restriction(uuid, uuid, text, uuid), public.admin_resolve_appeal(uuid, uuid, public.appeal_status, text),
  public.admin_set_role(uuid, uuid, public.app_role, boolean, text),
  public.admin_grant_conversation_access(uuid, uuid, text, uuid), public.admin_conversation_messages(uuid, uuid),
  public.admin_restrict_conversation(uuid, uuid, boolean, text, uuid),
  public.admin_user_contact(uuid, uuid), public.admin_find_user_by_email(uuid, text),
  public.admin_record_export(uuid, text, text, integer, jsonb),
  public.admin_save_category(uuid, uuid, text, text, text, text, boolean, boolean), public.admin_reorder_categories(uuid, uuid[]),
  public.admin_delete_category(uuid, uuid), public.admin_update_university(uuid, uuid, text, text, text),
  public.admin_add_domain(uuid, uuid, text, text), public.admin_set_domain_active(uuid, uuid, boolean, text),
  public.admin_add_meetup_area(uuid, uuid, text, text), public.admin_set_meetup_area_active(uuid, uuid, boolean),
  public.admin_set_setting(uuid, text, jsonb, text), public.admin_create_policy_version(uuid, jsonb, text, boolean),
  public.admin_activate_policy(uuid, uuid)
to service_role;

-- Policy helpers and permission-checked reads.
grant execute on function
  public.has_permission(text), public.my_report_cases(integer),
  public.admin_listing_state(public.listing_status, public.moderation_status, timestamptz), public.admin_like_pattern(text),
  public.admin_list_users(text, text, text, text, integer, integer),
  public.admin_list_listings(text, text, text, text, text, text, integer, integer, uuid),
  public.admin_list_reports(text, text, integer, integer, text, text, text, text, text, integer, integer),
  public.admin_search_conversations(text, integer, integer),
  public.admin_overview(date, date, text), public.admin_analytics(date, date, text)
to authenticated, service_role;
