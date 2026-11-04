-- Attempt limits for public auth forms (password reset), on top of Supabase Auth's own limits.
-- Keys are SHA-256 hashes computed by the server (email, IP), so no raw emails or IPs are stored.
create table public.auth_attempts (
  id bigint generated always as identity primary key,
  action text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_lookup_idx on public.auth_attempts (action, key_hash, created_at desc);
create index auth_attempts_created_idx on public.auth_attempts (created_at);

alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from public, anon, authenticated;

-- Records one attempt for every key if all of them are under their limit within the window, and
-- returns true. Returns false and records nothing when any key is over its limit.
create or replace function public.auth_attempt_allowed(p_action text, p_keys text[], p_limits integer[], p_window interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_n integer := coalesce(array_length(p_keys, 1), 0);
begin
  if p_action is null or v_n = 0 or v_n <> coalesce(array_length(p_limits, 1), 0) or p_window is null then
    raise exception 'INVALID_REQUEST';
  end if;

  delete from public.auth_attempts where created_at < now() - interval '1 day';

  for i in 1 .. v_n loop
    if (select count(*) from public.auth_attempts a
        where a.action = p_action and a.key_hash = p_keys[i] and a.created_at > now() - p_window) >= p_limits[i] then
      return false;
    end if;
  end loop;

  insert into public.auth_attempts (action, key_hash) select p_action, k from unnest(p_keys) as k;
  return true;
end;
$$;

revoke execute on function public.auth_attempt_allowed(text, text[], integer[], interval) from public, anon, authenticated;
grant execute on function public.auth_attempt_allowed(text, text[], integer[], interval) to service_role;
