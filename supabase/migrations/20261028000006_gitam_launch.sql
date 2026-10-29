-- Launch university for Gitam Trades (PRD §3.3 P0 decision, resolved 28 Oct 2026).
-- Only current students can join: @student.gitam.edu is the single allowlisted domain.
-- Alumni and staff domains are intentionally NOT allowed for the pilot.
-- Further domains and campus meetup areas are managed by admins in /admin/policy (audited).

insert into public.universities (id, slug, name, short_name)
values ('6a1f3c2e-4b7d-4e2a-9c1b-2d5e8f0a7b31', 'gitam', 'GITAM (Deemed to be University)', 'GITAM')
on conflict (slug) do nothing;

insert into public.university_domains (university_id, domain, note)
select u.id, 'student.gitam.edu', 'Current GITAM students (no alumni or staff during the pilot)'
from public.universities u
where u.slug = 'gitam'
on conflict (domain) do nothing;
