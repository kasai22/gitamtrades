-- Row Level Security and privileges.
-- Strategy: revoke every default privilege from anon/authenticated, then grant exactly what the
-- application needs. RLS is enabled on every table. service_role (server-only) keeps full access.

-- ---------------------------------------------------------------------------
-- Baseline privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter table public.universities enable row level security;
alter table public.university_domains enable row level security;
alter table public.meetup_areas enable row level security;
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.user_roles enable row level security;
alter table public.account_restrictions enable row level security;
alter table public.policy_versions enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.listing_declarations enable row level security;
alter table public.favourites enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.appeals enable row level security;
alter table public.moderation_events enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.analytics_events enable row level security;

-- Functions callable by clients. Helpers used inside policies must be executable by the querying role.
grant execute on function public.check_email_domain(text) to anon, authenticated;
grant execute on function
  public.has_active_restriction(uuid, public.restriction_kind),
  public.is_suspended(uuid),
  public.current_university_id(),
  public.is_verified_student(),
  public.is_staff(),
  public.is_admin(),
  public.can_sell(),
  public.is_blocked_between(uuid, uuid),
  public.can_message(uuid),
  public.effective_listing_status(public.listing_status, timestamptz),
  public.listing_transition_allowed(public.listing_status, public.listing_status),
  public.build_prefix_tsquery(text),
  public.policy_int(text[], integer),
  public.active_policy_version(),
  public.report_severity(public.report_reason),
  public.enable_selling(),
  public.change_listing_status(uuid, public.listing_status),
  public.renew_listing(uuid),
  public.search_listings(text, text, integer, integer, public.item_condition[], boolean, text, integer, integer),
  public.start_conversation(uuid),
  public.mark_conversation_read(uuid),
  public.unread_conversation_count(),
  public.submit_report(public.report_target, uuid, public.report_reason, text),
  public.submit_appeal(uuid, uuid, text),
  public.request_account_deletion(text),
  public.admin_metrics(integer)
to authenticated;
-- Explicitly server-only: persist_listing, expire_stale_listings, university_for_email, trigger functions.

-- ---------------------------------------------------------------------------
-- Configuration tables
-- ---------------------------------------------------------------------------
grant select on public.universities, public.categories to anon, authenticated;
grant select on public.university_domains to anon, authenticated;
grant select on public.meetup_areas to authenticated;

create policy universities_read on public.universities
  for select to anon, authenticated using (is_active or public.is_staff());
create policy categories_read on public.categories
  for select to anon, authenticated using (is_active or public.is_staff());
create policy university_domains_read on public.university_domains
  for select to anon, authenticated using (is_active or public.is_staff());
create policy meetup_areas_read on public.meetup_areas
  for select to authenticated
  using ((is_active and university_id = public.current_university_id()) or public.is_staff());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

create policy profiles_read on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_staff()
    or (public.is_verified_student() and university_id = public.current_university_id())
  );
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select on public.profile_private to authenticated;
grant update (contact_phone) on public.profile_private to authenticated;
create policy profile_private_own on public.profile_private
  for select to authenticated using (id = auth.uid());
create policy profile_private_update_own on public.profile_private
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.user_roles to authenticated;
create policy user_roles_read on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

grant select on public.account_restrictions to authenticated;
create policy account_restrictions_read on public.account_restrictions
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

grant select on public.policy_versions to authenticated;
create policy policy_versions_staff on public.policy_versions
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Listings — clients may read; all writes go through RPCs or the server.
-- ---------------------------------------------------------------------------
grant select on public.listings to authenticated;
create policy listings_read on public.listings
  for select to authenticated
  using (
    seller_id = auth.uid()
    or public.is_staff()
    or (
      public.is_verified_student()
      and university_id = public.current_university_id()
      and moderation_status = 'clear'
      and status in ('active', 'on_hold', 'sold', 'expired')
      and not public.is_suspended(seller_id)
    )
    -- A buyer keeps listing context for conversations they already started.
    or exists (select 1 from public.conversations c where c.listing_id = listings.id and c.buyer_id = auth.uid())
  );

grant select on public.listing_images to authenticated;
create policy listing_images_read on public.listing_images
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.is_staff()
    or (listing_id is not null and exists (select 1 from public.listings l where l.id = listing_images.listing_id))
  );

grant select on public.listing_declarations to authenticated;
create policy listing_declarations_read on public.listing_declarations
  for select to authenticated using (seller_id = auth.uid() or public.is_staff());

grant select, insert, delete on public.favourites to authenticated;
create policy favourites_read on public.favourites
  for select to authenticated using (user_id = auth.uid());
create policy favourites_insert on public.favourites
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_verified_student()
    and exists (select 1 from public.listings l where l.id = favourites.listing_id)
  );
create policy favourites_delete on public.favourites
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
grant select on public.conversations to authenticated;
create policy conversations_participants on public.conversations
  for select to authenticated using (auth.uid() in (buyer_id, seller_id));

grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, kind, body, client_id) on public.messages to authenticated;
create policy messages_read on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = messages.conversation_id));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind in ('text', 'contact_share')
    and public.can_message(conversation_id)
  );

grant select, insert, delete on public.blocks to authenticated;
create policy blocks_read on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid() and public.is_verified_student());
create policy blocks_delete on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Safety. Reporters see their own cases; reported users never see who reported them.
-- ---------------------------------------------------------------------------
grant select on public.reports to authenticated;
create policy reports_read on public.reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_staff());

grant select on public.appeals to authenticated;
create policy appeals_read on public.appeals
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

grant select on public.moderation_events to authenticated;
create policy moderation_events_staff on public.moderation_events
  for select to authenticated using (public.is_staff());

grant select on public.admin_audit_logs to authenticated;
create policy admin_audit_logs_staff on public.admin_audit_logs
  for select to authenticated using (public.is_staff());

grant select on public.account_deletion_requests to authenticated;
create policy deletion_requests_read on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

grant select on public.analytics_events to authenticated;
create policy analytics_events_staff on public.analytics_events
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Realtime: participants receive new messages (RLS on messages applies to subscriptions).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
