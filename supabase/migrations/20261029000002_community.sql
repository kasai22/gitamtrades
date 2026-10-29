-- Community: Reddit-style discussion threads for verified students (posts, nested comments, votes).
-- Same security model as listings:
--   * clients can READ (RLS) and VOTE (RLS-checked writes on their own vote rows);
--   * posts/comments are written by the server after automated text checks (service role), so
--     moderation can't be bypassed by calling the API directly;
--   * integrity, eligibility and rate limits are enforced by triggers regardless of caller.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id),
  author_id uuid references public.profiles (id) on delete set null,
  topic text not null check (topic in (
    'general', 'academics', 'hostel-life', 'events', 'lost-and-found', 'advice', 'marketplace-tips', 'off-topic'
  )),
  title text not null check (char_length(btrim(title)) between 3 and 150),
  body text not null default '' check (char_length(body) <= 10000),
  score integer not null default 0,
  comment_count integer not null default 0,
  moderation_status public.moderation_status not null default 'clear'
    check (moderation_status in ('clear', 'limited', 'removed')),
  moderation_source public.moderation_source,
  moderation_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(moderation_reasons) = 'array'),
  moderation_rule_version text,
  is_locked boolean not null default false,
  is_pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index forum_posts_feed_idx on public.forum_posts (university_id, created_at desc)
  where moderation_status = 'clear' and deleted_at is null;
create index forum_posts_topic_idx on public.forum_posts (university_id, topic, created_at desc);
create index forum_posts_author_idx on public.forum_posts (author_id, created_at desc);
create index forum_posts_review_idx on public.forum_posts (moderation_status, updated_at desc) where moderation_status <> 'clear';

create table public.forum_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  parent_id uuid references public.forum_comments (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) <= 5000),
  depth smallint not null default 0 check (depth between 0 and 8),
  score integer not null default 0,
  moderation_status public.moderation_status not null default 'clear'
    check (moderation_status in ('clear', 'limited', 'removed')),
  moderation_source public.moderation_source,
  moderation_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(moderation_reasons) = 'array'),
  moderation_rule_version text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deleted/removed comments keep their place in the thread with an empty body.
  check (deleted_at is not null or moderation_status = 'removed' or char_length(btrim(body)) >= 1)
);
create index forum_comments_post_idx on public.forum_comments (post_id, created_at);
create index forum_comments_author_idx on public.forum_comments (author_id, created_at);
create index forum_comments_review_idx on public.forum_comments (moderation_status, updated_at desc) where moderation_status <> 'clear';

create table public.forum_post_votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index forum_post_votes_post_idx on public.forum_post_votes (post_id);

create table public.forum_comment_votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.forum_comments (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
create index forum_comment_votes_comment_idx on public.forum_comment_votes (comment_id);

-- Reports and moderation trail can now point at community content.
alter table public.reports
  add column post_id uuid references public.forum_posts (id) on delete set null,
  add column comment_id uuid references public.forum_comments (id) on delete set null;
drop index public.reports_open_dedupe_idx;
create unique index reports_open_dedupe_idx on public.reports (
  reporter_id, target_type, (coalesce(comment_id, post_id, message_id, listing_id, reported_user_id))
) where status in ('open', 'in_review');

alter table public.moderation_events
  add column forum_post_id uuid references public.forum_posts (id) on delete set null,
  add column forum_comment_id uuid references public.forum_comments (id) on delete set null;
create index moderation_events_forum_post_idx on public.moderation_events (forum_post_id, created_at desc) where forum_post_id is not null;

-- ---------------------------------------------------------------------------
-- Integrity triggers (apply to every caller, including the service role)
-- ---------------------------------------------------------------------------
create or replace function public.community_author_check(p_author uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_university uuid;
begin
  select p.university_id into v_university from public.profiles p where p.id = p_author and p.email_verified_at is not null;
  if v_university is null then raise exception 'NOT_VERIFIED'; end if;
  if public.has_active_restriction(p_author, 'suspension') or public.has_active_restriction(p_author, 'messaging_ban') then
    raise exception 'COMMUNITY_RESTRICTED';
  end if;
  return v_university;
end;
$$;

create or replace function public.forum_posts_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.university_id := public.community_author_check(new.author_id);
    if (select count(*) from public.forum_posts p where p.author_id = new.author_id and p.created_at > now() - interval '1 day')
       >= public.policy_int(array['community', 'postsPerDay'], 10) then
      raise exception 'RATE_LIMITED:posts';
    end if;
    new.score := 0;
    new.comment_count := 0;
    new.created_at := now();
    new.last_activity_at := now();
  else
    if new.university_id <> old.university_id or new.author_id is distinct from old.author_id and new.author_id is not null then
      raise exception 'IMMUTABLE_FIELD';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger forum_posts_guard before insert or update on public.forum_posts
  for each row execute function public.forum_posts_guard();

create or replace function public.forum_comments_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_post public.forum_posts%rowtype;
  v_parent public.forum_comments%rowtype;
  v_university uuid;
begin
  if tg_op = 'UPDATE' then
    if new.post_id <> old.post_id or new.parent_id is distinct from old.parent_id then raise exception 'IMMUTABLE_FIELD'; end if;
    new.updated_at := now();
    return new;
  end if;

  v_university := public.community_author_check(new.author_id);
  select * into v_post from public.forum_posts where id = new.post_id;
  if not found or v_post.university_id <> v_university or v_post.deleted_at is not null or v_post.moderation_status = 'removed' then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_post.is_locked then raise exception 'POST_LOCKED'; end if;

  if new.parent_id is null then
    new.depth := 0;
  else
    select * into v_parent from public.forum_comments where id = new.parent_id;
    if not found or v_parent.post_id <> new.post_id then raise exception 'PARENT_NOT_FOUND'; end if;
    if v_parent.deleted_at is not null or v_parent.moderation_status = 'removed' then raise exception 'PARENT_NOT_FOUND'; end if;
    if v_parent.depth >= 8 then raise exception 'THREAD_TOO_DEEP'; end if;
    new.depth := v_parent.depth + 1;
  end if;

  if (select count(*) from public.forum_comments c where c.author_id = new.author_id and c.created_at > now() - interval '1 minute')
     >= public.policy_int(array['community', 'commentsPerMinute'], 10) then
    raise exception 'RATE_LIMITED:comments';
  end if;
  if (select count(*) from public.forum_comments c where c.author_id = new.author_id and c.created_at > now() - interval '1 day')
     >= public.policy_int(array['community', 'commentsPerDay'], 300) then
    raise exception 'RATE_LIMITED:comments';
  end if;

  new.score := 0;
  new.created_at := now();
  return new;
end;
$$;

create trigger forum_comments_guard before insert or update on public.forum_comments
  for each row execute function public.forum_comments_guard();

create or replace function public.forum_comments_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.forum_posts
  set comment_count = comment_count + case when new.moderation_status = 'clear' then 1 else 0 end,
      last_activity_at = now()
  where id = new.post_id;
  return new;
end;
$$;

create trigger forum_comments_after_insert after insert on public.forum_comments
  for each row execute function public.forum_comments_after_insert();

-- Scores are maintained from votes so clients never write them.
create or replace function public.forum_vote_score()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_delta integer := coalesce(case when tg_op <> 'DELETE' then new.value end, 0) - coalesce(case when tg_op <> 'INSERT' then old.value end, 0);
begin
  if tg_table_name = 'forum_post_votes' then
    update public.forum_posts set score = score + v_delta where id = coalesce(new.post_id, old.post_id);
  else
    update public.forum_comments set score = score + v_delta where id = coalesce(new.comment_id, old.comment_id);
  end if;
  return null;
end;
$$;

create trigger forum_post_votes_score after insert or update or delete on public.forum_post_votes
  for each row execute function public.forum_vote_score();
create trigger forum_comment_votes_score after insert or update or delete on public.forum_comment_votes
  for each row execute function public.forum_vote_score();

-- When an account is deleted its community content stays in the thread as "[deleted]" with no text.
create or replace function public.anonymise_community_content()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.forum_posts set title = '[deleted]', body = '', deleted_at = coalesce(deleted_at, now()) where author_id = old.id;
  update public.forum_comments set body = '', deleted_at = coalesce(deleted_at, now()) where author_id = old.id;
  return old;
end;
$$;

create trigger profiles_anonymise_community before delete on public.profiles
  for each row execute function public.anonymise_community_content();

-- ---------------------------------------------------------------------------
-- Feed (Hot / New / Top). SECURITY INVOKER so RLS decides visibility.
-- ---------------------------------------------------------------------------
create or replace function public.list_forum_posts(
  p_topic text default null,
  p_sort text default 'hot',
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  id uuid,
  topic text,
  title text,
  body_preview text,
  score integer,
  comment_count integer,
  author_id uuid,
  author_name text,
  created_at timestamptz,
  is_pinned boolean,
  is_locked boolean,
  my_vote smallint,
  total_count bigint
) language sql stable security invoker set search_path = '' as $$
  select
    p.id, p.topic, p.title, left(p.body, 280), p.score, p.comment_count, p.author_id, a.display_name,
    p.created_at, p.is_pinned, p.is_locked,
    (select v.value from public.forum_post_votes v where v.post_id = p.id and v.user_id = auth.uid()),
    count(*) over ()
  from public.forum_posts p
  left join public.profiles a on a.id = p.author_id
  where p.university_id = public.current_university_id()
    and p.moderation_status = 'clear'
    and p.deleted_at is null
    and (p_topic is null or p.topic = p_topic)
    and (p.author_id is null or not exists (
      select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.author_id
    ))
  order by
    case when p_sort = 'hot' and p_topic is null then p.is_pinned end desc nulls last,
    case when p_sort = 'hot' then
      (p.score + 1)::numeric / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.5)
    end desc nulls last,
    case when p_sort = 'top' then p.score end desc nulls last,
    p.created_at desc,
    p.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Reports: extend submit_report() with post and comment targets.
-- ---------------------------------------------------------------------------
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
  v_post_id uuid;
  v_comment_id uuid;
  v_evidence jsonb := '{}'::jsonb;
  v_row record;
  v_existing record;
  v_id uuid;
  v_case text;
  v_high integer;
  v_all integer;
  v_limit_reason jsonb := jsonb_build_array(jsonb_build_object(
    'code', 'under_review_reports',
    'severity', 'limit',
    'message', 'This is temporarily hidden while the safety team reviews reports from other students.'
  ));
  v_rule text := 'policy-v' || coalesce(public.active_policy_version()::text, '0');
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
  elsif p_target_type = 'message' then
    select m.id, m.sender_id, c.listing_id, m.body, m.kind, m.created_at into v_row
    from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.id = p_target_id and v_uid in (c.buyer_id, c.seller_id);
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_row.sender_id = v_uid then raise exception 'CANNOT_REPORT_SELF'; end if;
    v_message_id := v_row.id;
    v_user_id := v_row.sender_id;
    v_listing_id := v_row.listing_id;
    v_evidence := jsonb_build_object('body', v_row.body, 'kind', v_row.kind, 'sent_at', v_row.created_at);
  elsif p_target_type = 'post' then
    select fp.id, fp.author_id, fp.title, fp.body, fp.moderation_status into v_row
    from public.forum_posts fp
    where fp.id = p_target_id and fp.university_id = v_university and fp.deleted_at is null and fp.moderation_status <> 'removed';
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_row.author_id = v_uid then raise exception 'CANNOT_REPORT_SELF'; end if;
    v_post_id := v_row.id;
    v_user_id := v_row.author_id;
    v_evidence := jsonb_build_object('title', v_row.title, 'body', left(v_row.body, 2000));
  else
    select fc.id, fc.author_id, fc.post_id, fc.body into v_row
    from public.forum_comments fc join public.forum_posts fp on fp.id = fc.post_id
    where fc.id = p_target_id and fp.university_id = v_university and fc.deleted_at is null and fc.moderation_status <> 'removed';
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_row.author_id = v_uid then raise exception 'CANNOT_REPORT_SELF'; end if;
    v_comment_id := v_row.id;
    v_post_id := v_row.post_id;
    v_user_id := v_row.author_id;
    v_evidence := jsonb_build_object('body', v_row.body);
  end if;

  -- One open case per reporter and target (duplicate-report spam guard, SAFE-02).
  select r.id, r.case_number into v_existing from public.reports r
  where r.reporter_id = v_uid and r.target_type = p_target_type and r.status in ('open', 'in_review')
    and coalesce(r.comment_id, r.post_id, r.message_id, r.listing_id, r.reported_user_id)
      = coalesce(v_comment_id, case when p_target_type = 'post' then v_post_id end, v_message_id,
                 case when p_target_type in ('listing', 'message') then v_listing_id end, v_user_id);
  if found then
    return query select v_existing.id, v_existing.case_number, true;
    return;
  end if;

  if (select count(*) from public.reports r where r.reporter_id = v_uid and r.created_at > now() - interval '1 day')
     >= public.policy_int(array['rateLimits', 'reportsPerDay'], 20) then
    raise exception 'RATE_LIMITED:reports';
  end if;

  insert into public.reports (reporter_id, target_type, listing_id, reported_user_id, message_id, post_id, comment_id, reason, details, severity, evidence)
  values (
    v_uid, p_target_type,
    case when p_target_type in ('listing', 'message') then v_listing_id end,
    v_user_id, v_message_id,
    case when p_target_type in ('post', 'comment') then v_post_id end,
    v_comment_id,
    p_reason, nullif(btrim(coalesce(p_details, '')), ''),
    public.report_severity(p_reason), v_evidence
  ) returning id, reports.case_number into v_id, v_case;

  -- Proportionate automatic restriction once enough independent students report the same content.
  if p_target_type = 'listing' and v_listing.moderation_status = 'clear' and v_listing.status in ('active', 'on_hold') then
    select count(distinct r.reporter_id) filter (where r.severity = 3), count(distinct r.reporter_id) into v_high, v_all
    from public.reports r where r.listing_id = v_listing_id and r.target_type = 'listing' and r.status in ('open', 'in_review');
    if v_high >= public.policy_int(array['reports', 'highSeverityAutoLimitThreshold'], 2)
       or v_all >= public.policy_int(array['reports', 'anyReasonAutoLimitThreshold'], 3) then
      update public.listings set moderation_status = 'limited', moderation_source = 'user_reports',
        moderation_reasons = v_limit_reason, moderation_rule_version = v_rule
      where id = v_listing_id;
      insert into public.moderation_events (listing_id, subject_user_id, report_id, action, source, reason_codes, rule_version, metadata)
      values (v_listing_id, v_user_id, v_id, 'report_auto_limited', 'user_reports', array[p_reason::text], v_rule,
        jsonb_build_object('distinct_high_severity_reporters', v_high, 'distinct_reporters', v_all));
    end if;
  elsif p_target_type in ('post', 'comment') then
    select count(distinct r.reporter_id) filter (where r.severity = 3), count(distinct r.reporter_id) into v_high, v_all
    from public.reports r
    where r.target_type = p_target_type and r.status in ('open', 'in_review')
      and (case when p_target_type = 'post' then r.post_id = v_post_id and r.comment_id is null else r.comment_id = v_comment_id end);
    if v_high >= public.policy_int(array['reports', 'highSeverityAutoLimitThreshold'], 2)
       or v_all >= public.policy_int(array['reports', 'anyReasonAutoLimitThreshold'], 3) then
      if p_target_type = 'post' then
        update public.forum_posts set moderation_status = 'limited', moderation_source = 'user_reports',
          moderation_reasons = v_limit_reason, moderation_rule_version = v_rule
        where id = v_post_id and moderation_status = 'clear';
      else
        update public.forum_comments set moderation_status = 'limited', moderation_source = 'user_reports',
          moderation_reasons = v_limit_reason, moderation_rule_version = v_rule
        where id = v_comment_id and moderation_status = 'clear';
      end if;
      if found then
        insert into public.moderation_events (forum_post_id, forum_comment_id, subject_user_id, report_id, action, source, reason_codes, rule_version, metadata)
        values (v_post_id, v_comment_id, v_user_id, v_id, 'report_auto_limited', 'user_reports', array[p_reason::text], v_rule,
          jsonb_build_object('distinct_high_severity_reporters', v_high, 'distinct_reporters', v_all));
      end if;
    end if;
  end if;

  return query select v_id, v_case, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.forum_posts enable row level security;
alter table public.forum_comments enable row level security;
alter table public.forum_post_votes enable row level security;
alter table public.forum_comment_votes enable row level security;

revoke all on public.forum_posts, public.forum_comments, public.forum_post_votes, public.forum_comment_votes from anon, authenticated;
grant all on public.forum_posts, public.forum_comments, public.forum_post_votes, public.forum_comment_votes to service_role;
revoke execute on function
  public.community_author_check(uuid), public.forum_posts_guard(), public.forum_comments_guard(),
  public.forum_comments_after_insert(), public.forum_vote_score(), public.anonymise_community_content(),
  public.list_forum_posts(text, text, integer, integer), public.submit_report(public.report_target, uuid, public.report_reason, text)
from public, anon, authenticated;
grant execute on function
  public.community_author_check(uuid), public.forum_posts_guard(), public.forum_comments_guard(),
  public.forum_comments_after_insert(), public.forum_vote_score(), public.anonymise_community_content(),
  public.list_forum_posts(text, text, integer, integer), public.submit_report(public.report_target, uuid, public.report_reason, text)
to service_role;
grant execute on function
  public.list_forum_posts(text, text, integer, integer),
  public.submit_report(public.report_target, uuid, public.report_reason, text)
to authenticated;

grant select on public.forum_posts, public.forum_comments to authenticated;

create policy forum_posts_read on public.forum_posts
  for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_staff()
    or (
      public.is_verified_student()
      and university_id = public.current_university_id()
      and (moderation_status in ('clear', 'removed') or deleted_at is not null)
    )
  );

create policy forum_comments_read on public.forum_comments
  for select to authenticated
  using (
    exists (select 1 from public.forum_posts p where p.id = forum_comments.post_id)
    and (
      moderation_status in ('clear', 'removed')
      or deleted_at is not null
      or author_id = auth.uid()
      or public.is_staff()
    )
  );

grant select, insert, update, delete on public.forum_post_votes, public.forum_comment_votes to authenticated;

create policy forum_post_votes_own on public.forum_post_votes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.is_verified_student()
    and exists (
      select 1 from public.forum_posts p
      where p.id = forum_post_votes.post_id and p.moderation_status = 'clear' and p.deleted_at is null
    )
  );

create policy forum_comment_votes_own on public.forum_comment_votes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.is_verified_student()
    and exists (
      select 1 from public.forum_comments c
      where c.id = forum_comment_votes.comment_id and c.moderation_status = 'clear' and c.deleted_at is null
    )
  );
