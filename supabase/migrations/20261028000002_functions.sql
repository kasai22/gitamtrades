-- Helper functions, triggers and RPCs.
-- All SECURITY DEFINER functions pin search_path to '' and use fully-qualified names.
-- Errors are raised with stable, machine-readable messages (e.g. 'RATE_LIMITED:messages') that the
-- application maps to user-facing copy in src/lib/errors.ts.

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger profile_private_touch before update on public.profile_private
  for each row execute function public.touch_updated_at();
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- Integer setting from the active policy version, with a default when unset.
create or replace function public.policy_int(p_path text[], p_default integer)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select (pv.config #>> p_path)::integer from public.policy_versions pv where pv.is_active),
    p_default
  );
$$;

create or replace function public.active_policy_version()
returns integer language sql stable security definer set search_path = '' as $$
  select pv.version from public.policy_versions pv where pv.is_active;
$$;

-- ---------------------------------------------------------------------------
-- Identity & authorization helpers (used by RLS policies)
-- ---------------------------------------------------------------------------
create or replace function public.has_active_restriction(p_user uuid, p_kind public.restriction_kind)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_restrictions r
    where r.user_id = p_user
      and r.kind = p_kind
      and r.lifted_at is null
      and (r.expires_at is null or r.expires_at > now())
  );
$$;

create or replace function public.is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_active_restriction(p_user, 'suspension');
$$;

create or replace function public.current_university_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.university_id from public.profiles p where p.id = auth.uid();
$$;

-- Verified = university email confirmed and not suspended (AC-01).
create or replace function public.is_verified_student()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.email_verified_at is not null
  ) and not public.is_suspended(auth.uid());
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin');
$$;

-- Seller permission (AC-02): verified, seller-enabled, no listing ban.
create or replace function public.can_sell()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_verified_student()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.seller_enabled_at is not null)
    and not public.has_active_restriction(auth.uid(), 'listing_ban');
$$;

create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Can the current user post into this conversation? (CHAT-01, CHAT-03)
create or replace function public.can_message(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and auth.uid() in (c.buyer_id, c.seller_id)
      and not public.is_blocked_between(c.buyer_id, c.seller_id)
  )
  and public.is_verified_student()
  and not public.has_active_restriction(auth.uid(), 'messaging_ban');
$$;

-- ---------------------------------------------------------------------------
-- Sign-up: university domain allowlist (AUTH-01) and profile bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.university_for_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select d.university_id
  from public.university_domains d
  join public.universities u on u.id = d.university_id
  where d.domain = lower(btrim(split_part(p_email, '@', 2)))
    and d.is_active and u.is_active
  limit 1;
$$;

-- Public pre-check so the sign-up form can explain a rejection before calling Auth.
create or replace function public.check_email_domain(p_email text)
returns table (allowed boolean, university_name text)
language sql stable security definer set search_path = '' as $$
  select u.id is not null, u.name
  from (select public.university_for_email(p_email) as uid) x
  left join public.universities u on u.id = x.uid;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_university uuid;
  v_name text;
  v_terms text;
begin
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps verification state in sync and prevents moving an account to a non-university email.
create or replace function public.handle_auth_user_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_university uuid;
begin
  if new.email is distinct from old.email then
    v_university := public.university_for_email(new.email);
    if v_university is null then
      raise exception 'EMAIL_DOMAIN_NOT_ALLOWED';
    end if;
    update public.profiles set university_id = v_university where id = new.id;
    update public.profile_private set email_domain = lower(split_part(new.email, '@', 2)) where id = new.id;
  end if;
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles set email_verified_at = new.email_confirmed_at where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_auth_user_updated();

-- Self-service seller enablement (AUTH-03, AC-02). No admin approval.
create or replace function public.enable_selling()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_verified_student() then raise exception 'NOT_VERIFIED'; end if;
  update public.profiles set seller_enabled_at = coalesce(seller_enabled_at, now())
  where id = auth.uid() returning seller_enabled_at into v_at;
  update public.profile_private set seller_terms_accepted_at = now() where id = auth.uid();
  return v_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create or replace function public.listings_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.listings l
        where l.seller_id = new.seller_id and l.created_at > now() - interval '1 day')
       >= public.policy_int(array['rateLimits', 'listingsPerDay'], 10) then
      raise exception 'RATE_LIMITED:listings';
    end if;
  else
    if new.seller_id <> old.seller_id or new.university_id <> old.university_id then
      raise exception 'IMMUTABLE_FIELD';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_guard
  before insert or update on public.listings
  for each row execute function public.listings_guard();

-- Seller-driven lifecycle transitions (PRD §8.3). Mirrored in src/features/listings/status.ts.
create or replace function public.listing_transition_allowed(p_from public.listing_status, p_to public.listing_status)
returns boolean language sql immutable set search_path = '' as $$
  select (p_from::text || '>' || p_to::text) = any (array[
    'active>on_hold', 'active>sold', 'active>removed',
    'on_hold>active', 'on_hold>sold', 'on_hold>removed',
    'sold>active', 'sold>removed',
    'expired>active', 'expired>removed',
    'draft>removed'
  ]);
$$;

-- Listings past expires_at are treated as expired even before the expiry job persists it.
create or replace function public.effective_listing_status(p_status public.listing_status, p_expires_at timestamptz)
returns public.listing_status language sql stable set search_path = '' as $$
  select case
    when p_status in ('active', 'on_hold') and p_expires_at is not null and p_expires_at <= now()
      then 'expired'::public.listing_status
    else p_status
  end;
$$;

create or replace function public.change_listing_status(p_listing_id uuid, p_status public.listing_status)
returns public.listing_status language plpgsql security definer set search_path = '' as $$
declare
  v public.listings%rowtype;
  v_from public.listing_status;
  v_days integer := public.policy_int(array['listingExpiryDays'], 60);
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v from public.listings where id = p_listing_id for update;
  if not found or v.seller_id <> auth.uid() then raise exception 'LISTING_NOT_FOUND'; end if;
  if not public.is_verified_student() then raise exception 'NOT_VERIFIED'; end if;

  v_from := public.effective_listing_status(v.status, v.expires_at);
  if not public.listing_transition_allowed(v_from, p_status) then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status = 'active' then
    if v.moderation_status <> 'clear' then raise exception 'LISTING_UNDER_REVIEW'; end if;
    if not public.can_sell() then raise exception 'SELLING_RESTRICTED'; end if;
  end if;

  update public.listings set
    status = p_status,
    sold_at = case when p_status = 'sold' then now() when p_status = 'active' then null else sold_at end,
    published_at = case when p_status = 'active' and v_from in ('expired', 'sold') then now() else published_at end,
    expires_at = case
      when p_status = 'active' and (v_from in ('expired', 'sold') or expires_at is null)
        then now() + make_interval(days => v_days)
      else expires_at end
  where id = p_listing_id;

  return p_status;
end;
$$;

-- LIST-07: extend an active/on-hold/expired listing's activity window.
create or replace function public.renew_listing(p_listing_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v public.listings%rowtype;
  v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v from public.listings where id = p_listing_id for update;
  if not found or v.seller_id <> auth.uid() then raise exception 'LISTING_NOT_FOUND'; end if;
  if v.status not in ('active', 'on_hold', 'expired') then raise exception 'INVALID_TRANSITION'; end if;
  if v.moderation_status <> 'clear' then raise exception 'LISTING_UNDER_REVIEW'; end if;
  if not public.can_sell() then raise exception 'SELLING_RESTRICTED'; end if;

  v_expires := now() + make_interval(days => public.policy_int(array['listingExpiryDays'], 60));
  update public.listings set
    status = case when status = 'expired' then 'active'::public.listing_status else status end,
    expires_at = v_expires
  where id = p_listing_id;
  return v_expires;
end;
$$;

-- Persists expiry for listings whose window has passed. Schedule with pg_cron (see README).
create or replace function public.expire_stale_listings()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with expired as (
    update public.listings set status = 'expired'
    where status in ('active', 'on_hold') and expires_at is not null and expires_at <= now()
    returning id, seller_id
  ), logged as (
    insert into public.moderation_events (listing_id, subject_user_id, action, source)
    select id, seller_id, 'expired', 'system' from expired
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

-- Atomic create/update used by the server after running the automated checks (LIST-01/04/06, SAFE-01).
-- Callable by service_role only: clients cannot choose their own moderation outcome.
create or replace function public.persist_listing(
  p_seller_id uuid,
  p_listing_id uuid,
  p_listing jsonb,
  p_decision jsonb,
  p_image_ids uuid[],
  p_declaration jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.listings%rowtype;
  v_category public.categories%rowtype;
  v_intent text := p_decision ->> 'intent';
  v_outcome text := p_decision ->> 'outcome';
  v_reasons jsonb := coalesce(p_decision -> 'reasons', '[]'::jsonb);
  v_rule_version text := p_decision ->> 'rule_version';
  v_policy_version text := coalesce(p_decision ->> 'policy_version', 'unknown');
  v_expiry_days integer := public.policy_int(array['listingExpiryDays'], 60);
  v_max_images integer := public.policy_int(array['maxImagesPerListing'], 8);
  v_image_ids uuid[] := coalesce(p_image_ids, '{}'::uuid[]);
  v_image_count integer := coalesce(array_length(p_image_ids, 1), 0);
  v_meetup uuid := nullif(p_listing ->> 'meetup_area_id', '')::uuid;
  v_client_request uuid := nullif(p_listing ->> 'client_request_id', '')::uuid;
  v_is_new boolean := p_listing_id is null;
  v_status public.listing_status;
  v_mod public.moderation_status;
  v_source public.moderation_source;
  v_published_at timestamptz;
  v_expires_at timestamptz;
  v_id uuid;
  v_attached integer;
  v_removed_paths text[];
  v_now timestamptz := now();
begin
  if v_intent is null or v_intent not in ('draft', 'publish') then raise exception 'INVALID_INTENT'; end if;
  if v_intent = 'publish' and (v_outcome is null or v_outcome not in ('allow', 'limit', 'block')) then
    raise exception 'INVALID_DECISION';
  end if;

  select * into v_profile from public.profiles where id = p_seller_id;
  if not found or v_profile.email_verified_at is null then raise exception 'NOT_VERIFIED'; end if;
  if v_profile.seller_enabled_at is null then raise exception 'SELLING_NOT_ENABLED'; end if;
  if public.has_active_restriction(p_seller_id, 'suspension')
     or public.has_active_restriction(p_seller_id, 'listing_ban') then
    raise exception 'SELLING_RESTRICTED';
  end if;

  select * into v_category from public.categories
  where id = nullif(p_listing ->> 'category_id', '')::uuid and is_active;
  if not found then raise exception 'CATEGORY_NOT_AVAILABLE'; end if;

  if v_meetup is not null and not exists (
    select 1 from public.meetup_areas m
    where m.id = v_meetup and m.university_id = v_profile.university_id and m.is_active
  ) then
    raise exception 'MEETUP_AREA_INVALID';
  end if;

  if v_image_count > v_max_images then raise exception 'TOO_MANY_IMAGES'; end if;

  if v_intent = 'publish' then
    if coalesce((p_declaration ->> 'owns_item')::boolean, false) is not true
       or coalesce((p_declaration ->> 'complies_with_policy')::boolean, false) is not true then
      raise exception 'DECLARATION_REQUIRED';
    end if;
    if v_category.is_ticket and (
      coalesce((p_listing ->> 'ticket_transfer_confirmed')::boolean, false) is not true
      or coalesce((p_declaration ->> 'ticket_transferable')::boolean, false) is not true
    ) then
      raise exception 'TICKET_TRANSFER_CONFIRMATION_REQUIRED';
    end if;
  end if;

  if v_is_new then
    -- Idempotent publish (NFR reliability): a retried request returns the original listing.
    if v_client_request is not null then
      select * into v_existing from public.listings
      where seller_id = p_seller_id and client_request_id = v_client_request;
      if found then
        return jsonb_build_object(
          'listing_id', v_existing.id,
          'status', v_existing.status,
          'moderation_status', v_existing.moderation_status,
          'duplicate_request', true,
          'removed_image_paths', '[]'::jsonb
        );
      end if;
    end if;
  else
    select * into v_existing from public.listings where id = p_listing_id for update;
    if not found or v_existing.seller_id <> p_seller_id then raise exception 'LISTING_NOT_FOUND'; end if;
    if v_existing.status = 'removed' then raise exception 'LISTING_NOT_EDITABLE'; end if;
    if v_existing.moderation_status = 'removed' then raise exception 'LISTING_REMOVED_BY_ADMIN'; end if;
  end if;

  -- Resolve lifecycle and moderation state.
  if v_intent = 'draft' then
    if not v_is_new and v_existing.status <> 'draft' then raise exception 'ONLY_DRAFTS_CAN_BE_SAVED_AS_DRAFT'; end if;
    v_status := 'draft';
    if not v_is_new and v_existing.moderation_source in ('user_reports', 'admin') then
      v_mod := v_existing.moderation_status;
      v_source := v_existing.moderation_source;
      v_reasons := v_existing.moderation_reasons;
      v_rule_version := v_existing.moderation_rule_version;
    else
      v_mod := 'unchecked';
      v_source := null;
      v_reasons := '[]'::jsonb;
      v_rule_version := null;
    end if;
  else
    if not v_is_new and v_existing.moderation_status = 'limited'
       and v_existing.moderation_source in ('user_reports', 'admin') and v_outcome <> 'block' then
      -- Editing cannot escape a restriction placed because of reports or by an admin.
      v_mod := 'limited';
      v_source := v_existing.moderation_source;
      v_reasons := v_existing.moderation_reasons;
      v_rule_version := v_existing.moderation_rule_version;
    else
      v_source := 'automated_check';
      v_mod := case v_outcome when 'allow' then 'clear' when 'limit' then 'limited' else 'blocked' end;
    end if;

    if v_mod = 'blocked' then
      v_status := 'draft';
    elsif v_is_new or v_existing.status in ('draft', 'expired') then
      v_status := 'active';
    else
      v_status := v_existing.status;
    end if;
  end if;

  if v_status in ('active', 'on_hold', 'sold') then
    if v_is_new or v_existing.status in ('draft', 'expired') then
      v_published_at := v_now;
      v_expires_at := v_now + make_interval(days => v_expiry_days);
    else
      v_published_at := coalesce(v_existing.published_at, v_now);
      v_expires_at := case
        when v_existing.expires_at is null or v_existing.expires_at <= v_now
          then v_now + make_interval(days => v_expiry_days)
        else v_existing.expires_at end;
    end if;
  elsif v_is_new then
    v_published_at := null;
    v_expires_at := null;
  else
    v_published_at := v_existing.published_at;
    v_expires_at := v_existing.expires_at;
  end if;

  if v_is_new then
    insert into public.listings (
      seller_id, university_id, category_id, title, description, price_inr, condition, meetup_area_id,
      ticket_event_name, ticket_event_date, ticket_transfer_confirmed,
      status, moderation_status, moderation_source, moderation_reasons, moderation_rule_version,
      client_request_id, published_at, expires_at
    ) values (
      p_seller_id, v_profile.university_id, v_category.id,
      btrim(p_listing ->> 'title'), coalesce(p_listing ->> 'description', ''),
      (p_listing ->> 'price_inr')::integer, (p_listing ->> 'condition')::public.item_condition, v_meetup,
      case when v_category.is_ticket then nullif(btrim(coalesce(p_listing ->> 'ticket_event_name', '')), '') end,
      case when v_category.is_ticket then nullif(p_listing ->> 'ticket_event_date', '')::date end,
      v_category.is_ticket and coalesce((p_listing ->> 'ticket_transfer_confirmed')::boolean, false),
      v_status, v_mod, v_source, v_reasons, v_rule_version,
      v_client_request, v_published_at, v_expires_at
    ) returning id into v_id;
  else
    update public.listings set
      category_id = v_category.id,
      title = btrim(p_listing ->> 'title'),
      description = coalesce(p_listing ->> 'description', ''),
      price_inr = (p_listing ->> 'price_inr')::integer,
      condition = (p_listing ->> 'condition')::public.item_condition,
      meetup_area_id = v_meetup,
      ticket_event_name = case when v_category.is_ticket then nullif(btrim(coalesce(p_listing ->> 'ticket_event_name', '')), '') end,
      ticket_event_date = case when v_category.is_ticket then nullif(p_listing ->> 'ticket_event_date', '')::date end,
      ticket_transfer_confirmed = v_category.is_ticket and coalesce((p_listing ->> 'ticket_transfer_confirmed')::boolean, false),
      status = v_status,
      moderation_status = v_mod,
      moderation_source = v_source,
      moderation_reasons = v_reasons,
      moderation_rule_version = v_rule_version,
      published_at = v_published_at,
      expires_at = v_expires_at
    where id = p_listing_id;
    v_id := p_listing_id;
  end if;

  -- Images: drop those no longer referenced, then attach/reorder the requested set.
  with removed as (
    delete from public.listing_images li
    where li.listing_id = v_id and not (li.id = any (v_image_ids))
    returning li.storage_path, li.thumb_path
  )
  select coalesce(array_agg(p), '{}'::text[]) into v_removed_paths
  from (select storage_path as p from removed union all select thumb_path from removed) s;

  if v_image_count > 0 then
    update public.listing_images li
    set listing_id = v_id, position = (o.ord - 1)::smallint
    from unnest(v_image_ids) with ordinality as o(image_id, ord)
    where li.id = o.image_id
      and li.owner_id = p_seller_id
      and (li.listing_id is null or li.listing_id = v_id);
    get diagnostics v_attached = row_count;
    if v_attached <> v_image_count then raise exception 'IMAGE_NOT_OWNED'; end if;
  end if;

  if v_intent = 'publish' then
    insert into public.listing_declarations (listing_id, seller_id, policy_version, owns_item, complies_with_policy, ticket_transferable)
    values (
      v_id, p_seller_id, v_policy_version, true, true,
      case when v_category.is_ticket then true end
    );

    insert into public.moderation_events (listing_id, subject_user_id, action, source, reason_codes, rule_version, metadata)
    values (
      v_id, p_seller_id,
      case v_mod when 'clear' then 'auto_published' when 'limited' then 'auto_limited' else 'auto_blocked' end,
      'automated_check',
      coalesce(array(select e ->> 'code' from jsonb_array_elements(coalesce(p_decision -> 'reasons', '[]'::jsonb)) e), '{}'),
      p_decision ->> 'rule_version',
      jsonb_build_object(
        'outcome', v_outcome,
        'is_edit', not v_is_new,
        'kept_existing_restriction', v_source is distinct from 'automated_check',
        'signals', coalesce(p_decision -> 'signals', '[]'::jsonb)
      )
    );
  end if;

  return jsonb_build_object(
    'listing_id', v_id,
    'status', v_status,
    'moderation_status', v_mod,
    'duplicate_request', false,
    'removed_image_paths', to_jsonb(v_removed_paths)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Discovery (DISC-02, DISC-03). SECURITY INVOKER so listing RLS still applies.
-- ---------------------------------------------------------------------------
create or replace function public.build_prefix_tsquery(p_query text)
returns tsquery language sql immutable set search_path = '' as $$
  with terms as (
    select t from unnest(regexp_split_to_array(lower(coalesce(p_query, '')), '[^[:alnum:]]+')) with ordinality as x(t, n)
    where t <> '' and char_length(t) <= 40
    order by n
    limit 8
  )
  select case when count(*) = 0 then null
    else to_tsquery('english'::regconfig, string_agg(t || ':*', ' & ')) end
  from terms;
$$;

create or replace function public.search_listings(
  p_query text default null,
  p_category_slug text default null,
  p_min_price integer default null,
  p_max_price integer default null,
  p_conditions public.item_condition[] default null,
  p_include_on_hold boolean default false,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0
) returns table (
  id uuid,
  title text,
  price_inr integer,
  condition public.item_condition,
  status public.listing_status,
  published_at timestamptz,
  updated_at timestamptz,
  category_slug text,
  category_name text,
  seller_id uuid,
  seller_name text,
  meetup_area_name text,
  cover_thumb_path text,
  image_count integer,
  total_count bigint
) language sql stable security invoker set search_path = '' as $$
  with q as (
    select public.build_prefix_tsquery(p_query) as tsq
  )
  select
    l.id, l.title, l.price_inr, l.condition, l.status, l.published_at, l.updated_at,
    c.slug, c.name, l.seller_id, p.display_name, m.name,
    img.thumb_path,
    coalesce(img.cnt, 0)::integer,
    count(*) over ()
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.meetup_areas m on m.id = l.meetup_area_id
  cross join q
  left join lateral (
    select li.thumb_path, count(*) over () as cnt
    from public.listing_images li
    where li.listing_id = l.id
    order by li.position
    limit 1
  ) img on true
  where l.university_id = public.current_university_id()
    and l.moderation_status = 'clear'
    and (l.status = 'active' or (p_include_on_hold and l.status = 'on_hold'))
    and (l.expires_at is null or l.expires_at > now())
    and (q.tsq is null or l.search_vector @@ q.tsq)
    and (p_category_slug is null or c.slug = p_category_slug)
    and (p_min_price is null or l.price_inr >= p_min_price)
    and (p_max_price is null or l.price_inr <= p_max_price)
    and (p_conditions is null or cardinality(p_conditions) = 0 or l.condition = any (p_conditions))
    and not exists (
      select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = l.seller_id
    )
  order by
    case when p_sort = 'relevance' and q.tsq is not null then ts_rank(l.search_vector, q.tsq) end desc nulls last,
    case when p_sort = 'price_asc' then l.price_inr end asc nulls last,
    case when p_sort = 'price_desc' then l.price_inr end desc nulls last,
    l.published_at desc nulls last,
    l.id
  limit least(greatest(coalesce(p_limit, 24), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
-- Idempotent: one conversation per (listing, buyer). New conversations require an available listing.
create or replace function public.start_conversation(p_listing_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_verified_student() then raise exception 'NOT_VERIFIED'; end if;
  if public.has_active_restriction(v_uid, 'messaging_ban') then raise exception 'MESSAGING_RESTRICTED'; end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found or v_listing.university_id is distinct from public.current_university_id() then
    raise exception 'LISTING_NOT_FOUND';
  end if;
  if v_listing.seller_id = v_uid then raise exception 'CANNOT_MESSAGE_OWN_LISTING'; end if;

  select c.id into v_id from public.conversations c where c.listing_id = p_listing_id and c.buyer_id = v_uid;
  if v_id is not null then return v_id; end if;

  if public.effective_listing_status(v_listing.status, v_listing.expires_at) <> 'active'
     or v_listing.moderation_status <> 'clear'
     or public.is_suspended(v_listing.seller_id) then
    raise exception 'LISTING_NOT_AVAILABLE';
  end if;
  if public.is_blocked_between(v_uid, v_listing.seller_id) then raise exception 'USER_BLOCKED'; end if;
  if (select count(*) from public.conversations c where c.buyer_id = v_uid and c.created_at > now() - interval '1 day')
     >= public.policy_int(array['rateLimits', 'conversationsPerDay'], 30) then
    raise exception 'RATE_LIMITED:conversations';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (p_listing_id, v_uid, v_listing.seller_id)
  on conflict (listing_id, buyer_id) do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id from public.conversations c where c.listing_id = p_listing_id and c.buyer_id = v_uid;
  end if;
  return v_id;
end;
$$;

create or replace function public.messages_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  new.body := btrim(new.body);
  if new.kind <> 'system' then
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

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations c set
    last_message_at = new.created_at,
    last_message_preview = case new.kind
      when 'contact_share' then 'Shared contact details'
      else left(regexp_replace(new.body, '\s+', ' ', 'g'), 120) end,
    buyer_last_read_at = case when new.sender_id = c.buyer_id then new.created_at else c.buyer_last_read_at end,
    seller_last_read_at = case when new.sender_id = c.seller_id then new.created_at else c.seller_last_read_at end
  where c.id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set
    buyer_last_read_at = case when buyer_id = auth.uid() then now() else buyer_last_read_at end,
    seller_last_read_at = case when seller_id = auth.uid() then now() else seller_last_read_at end
  where id = p_conversation_id and auth.uid() in (buyer_id, seller_id);
end;
$$;

create or replace function public.unread_conversation_count()
returns integer language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from public.conversations c
  where (c.buyer_id = auth.uid() and c.last_message_at > coalesce(c.buyer_last_read_at, '-infinity'::timestamptz))
     or (c.seller_id = auth.uid() and c.last_message_at > coalesce(c.seller_last_read_at, '-infinity'::timestamptz));
$$;

-- ---------------------------------------------------------------------------
-- Reports (SAFE-02, SAFE-03) — de-duplicated, rate-limited, threshold-based auto-limit.
-- ---------------------------------------------------------------------------
create or replace function public.report_severity(p_reason public.report_reason)
returns smallint language sql immutable set search_path = '' as $$
  select case p_reason
    when 'prohibited_item' then 3 when 'scam' then 3 when 'counterfeit' then 3 when 'safety' then 3
    when 'harassment' then 2 when 'misleading' then 2
    else 1 end::smallint;
$$;

create or replace function public.submit_report(
  p_target_type public.report_target,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text default null
) returns table (report_id uuid, case_number text, already_reported boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_university uuid := public.current_university_id();
  v_listing public.listings%rowtype;
  v_listing_id uuid;
  v_user_id uuid;
  v_message_id uuid;
  v_evidence jsonb := '{}'::jsonb;
  v_existing record;
  v_id uuid;
  v_case text;
  v_high integer;
  v_all integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_verified_student() then raise exception 'NOT_VERIFIED'; end if;
  if p_details is not null and char_length(p_details) > 1000 then raise exception 'DETAILS_TOO_LONG'; end if;

  if p_target_type = 'listing' then
    select * into v_listing from public.listings l where l.id = p_target_id;
    if not found or v_listing.university_id is distinct from v_university or v_listing.status = 'draft' then
      raise exception 'TARGET_NOT_FOUND';
    end if;
    if v_listing.seller_id = v_uid then raise exception 'CANNOT_REPORT_SELF'; end if;
    v_listing_id := v_listing.id;
    v_user_id := v_listing.seller_id;
    v_evidence := jsonb_build_object('title', v_listing.title, 'price_inr', v_listing.price_inr, 'status', v_listing.status);
  elsif p_target_type = 'user' then
    select p.id into v_user_id from public.profiles p where p.id = p_target_id and p.university_id = v_university;
    if v_user_id is null then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_user_id = v_uid then raise exception 'CANNOT_REPORT_SELF'; end if;
  else
    select m.id, m.sender_id, c.listing_id, m.body, m.kind, m.created_at
      into v_existing
    from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.id = p_target_id and v_uid in (c.buyer_id, c.seller_id);
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_existing.sender_id = v_uid then raise exception 'CANNOT_REPORT_SELF'; end if;
    v_message_id := v_existing.id;
    v_user_id := v_existing.sender_id;
    v_listing_id := v_existing.listing_id;
    -- Snapshot so evidence survives deletion; visible to the reporter (their own conversation) and staff only.
    v_evidence := jsonb_build_object('body', v_existing.body, 'kind', v_existing.kind, 'sent_at', v_existing.created_at);
  end if;

  select r.id, r.case_number into v_existing from public.reports r
  where r.reporter_id = v_uid and r.target_type = p_target_type
    and r.status in ('open', 'in_review')
    and coalesce(r.message_id, r.listing_id, r.reported_user_id) = coalesce(v_message_id, v_listing_id, v_user_id)
    and (p_target_type <> 'listing' or r.listing_id = v_listing_id)
    and (p_target_type <> 'user' or (r.reported_user_id = v_user_id and r.listing_id is null and r.message_id is null));
  if found then
    return query select v_existing.id, v_existing.case_number, true;
    return;
  end if;

  if (select count(*) from public.reports r where r.reporter_id = v_uid and r.created_at > now() - interval '1 day')
     >= public.policy_int(array['rateLimits', 'reportsPerDay'], 20) then
    raise exception 'RATE_LIMITED:reports';
  end if;

  insert into public.reports (reporter_id, target_type, listing_id, reported_user_id, message_id, reason, details, severity, evidence)
  values (
    v_uid, p_target_type,
    case when p_target_type = 'user' then null else v_listing_id end,
    v_user_id,
    v_message_id,
    p_reason, nullif(btrim(coalesce(p_details, '')), ''),
    public.report_severity(p_reason), v_evidence
  ) returning id, reports.case_number into v_id, v_case;

  -- Automatic, proportionate restriction for listings with enough independent reports.
  if p_target_type = 'listing' and v_listing.moderation_status = 'clear' and v_listing.status in ('active', 'on_hold') then
    select
      count(distinct r.reporter_id) filter (where r.severity = 3),
      count(distinct r.reporter_id)
    into v_high, v_all
    from public.reports r
    where r.listing_id = v_listing_id and r.target_type = 'listing' and r.status in ('open', 'in_review');

    if v_high >= public.policy_int(array['reports', 'highSeverityAutoLimitThreshold'], 2)
       or v_all >= public.policy_int(array['reports', 'anyReasonAutoLimitThreshold'], 3) then
      update public.listings set
        moderation_status = 'limited',
        moderation_source = 'user_reports',
        moderation_reasons = jsonb_build_array(jsonb_build_object(
          'code', 'under_review_reports',
          'severity', 'limit',
          'message', 'This listing is temporarily hidden while the safety team reviews reports from other students.'
        )),
        moderation_rule_version = 'policy-v' || coalesce(public.active_policy_version()::text, '0')
      where id = v_listing_id;

      insert into public.moderation_events (listing_id, subject_user_id, report_id, action, source, reason_codes, rule_version, metadata)
      values (
        v_listing_id, v_user_id, v_id, 'report_auto_limited', 'user_reports', array[p_reason::text],
        'policy-v' || coalesce(public.active_policy_version()::text, '0'),
        jsonb_build_object('distinct_high_severity_reporters', v_high, 'distinct_reporters', v_all)
      );
    end if;
  end if;

  return query select v_id, v_case, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Appeals (SAFE-04) — allowed for suspended users too.
-- ---------------------------------------------------------------------------
create or replace function public.submit_appeal(
  p_listing_id uuid,
  p_restriction_id uuid,
  p_message text
) returns table (appeal_id uuid, case_number text, already_open boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_existing record;
  v_id uuid;
  v_case text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if (p_listing_id is null) = (p_restriction_id is null) then raise exception 'APPEAL_TARGET_REQUIRED'; end if;
  if p_message is null or char_length(btrim(p_message)) < 10 or char_length(p_message) > 2000 then
    raise exception 'APPEAL_MESSAGE_INVALID';
  end if;

  if p_listing_id is not null then
    if not exists (
      select 1 from public.listings l
      where l.id = p_listing_id and l.seller_id = v_uid and l.moderation_status in ('limited', 'blocked', 'removed')
    ) then
      raise exception 'NOTHING_TO_APPEAL';
    end if;
  else
    if not exists (
      select 1 from public.account_restrictions r
      where r.id = p_restriction_id and r.user_id = v_uid and r.lifted_at is null
        and (r.expires_at is null or r.expires_at > now())
    ) then
      raise exception 'NOTHING_TO_APPEAL';
    end if;
  end if;

  select a.id, a.case_number into v_existing from public.appeals a
  where a.user_id = v_uid and a.status = 'open'
    and coalesce(a.listing_id, a.restriction_id) = coalesce(p_listing_id, p_restriction_id);
  if found then
    return query select v_existing.id, v_existing.case_number, true;
    return;
  end if;

  if (select count(*) from public.appeals a where a.user_id = v_uid and a.created_at > now() - interval '1 day') >= 10 then
    raise exception 'RATE_LIMITED:appeals';
  end if;

  insert into public.appeals (user_id, listing_id, restriction_id, message)
  values (v_uid, p_listing_id, p_restriction_id, btrim(p_message))
  returning id, appeals.case_number into v_id, v_case;

  return query select v_id, v_case, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion request (AUTH-04). Live listings are taken down immediately.
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion(p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select d.id into v_id from public.account_deletion_requests d where d.user_id = auth.uid() and d.status = 'pending';
  if v_id is not null then return v_id; end if;

  insert into public.account_deletion_requests (user_id, reason)
  values (auth.uid(), nullif(left(btrim(coalesce(p_reason, '')), 500), ''))
  returning id into v_id;

  update public.listings set status = 'removed'
  where seller_id = auth.uid() and status in ('draft', 'active', 'on_hold', 'expired');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin metrics (PRD §11) — staff only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_metrics(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
  v_result jsonb;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;

  select jsonb_build_object(
    'window_days', greatest(1, least(coalesce(p_days, 7), 90)),
    'verified_users', (select count(*) from public.profiles where email_verified_at is not null),
    'new_verified_users', (select count(*) from public.profiles where email_verified_at >= v_since),
    'sellers', (select count(*) from public.profiles where seller_enabled_at is not null),
    'active_listings', (select count(*) from public.listings
      where status = 'active' and moderation_status = 'clear' and (expires_at is null or expires_at > now())),
    'listings_published', (select count(*) from public.moderation_events where action = 'auto_published' and created_at >= v_since),
    'listings_blocked', (select count(*) from public.moderation_events where action = 'auto_blocked' and created_at >= v_since),
    'listings_limited', (select count(*) from public.moderation_events where action in ('auto_limited', 'report_auto_limited') and created_at >= v_since),
    'listings_sold', (select count(*) from public.listings where sold_at >= v_since),
    'conversations_started', (select count(*) from public.conversations where created_at >= v_since),
    'successful_connections', (
      select count(*) from public.conversations c
      where exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = c.buyer_id and m.created_at >= v_since)
        and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = c.seller_id and m.created_at >= v_since)
    ),
    'open_reports', (select count(*) from public.reports where status in ('open', 'in_review')),
    'high_severity_open_reports', (select count(*) from public.reports where status in ('open', 'in_review') and severity = 3),
    'reports_created', (select count(*) from public.reports where created_at >= v_since),
    'open_appeals', (select count(*) from public.appeals where status = 'open'),
    'appeals_overturned', (select count(*) from public.appeals where status = 'overturned' and resolved_at >= v_since),
    'appeals_upheld', (select count(*) from public.appeals where status = 'upheld' and resolved_at >= v_since),
    'pending_deletions', (select count(*) from public.account_deletion_requests where status = 'pending'),
    'active_restrictions', (select count(*) from public.account_restrictions where lifted_at is null and (expires_at is null or expires_at > now()))
  ) into v_result;
  return v_result;
end;
$$;
