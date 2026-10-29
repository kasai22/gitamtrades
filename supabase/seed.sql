-- Local development seed (applied by `npx supabase db reset`; NOT applied by `db push`).
-- The GITAM university and its @student.gitam.edu domain come from migration 0006.
-- These sample meetup areas are for local testing only. Add the real campus spots in
-- /admin/policy once they're agreed (they should be busy, public places, never hostels or rooms).

insert into public.meetup_areas (university_id, name, description, sort_order)
select u.id, area.name, area.description, area.sort_order
from public.universities u
cross join (values
  ('Central Library entrance', 'Sample: busy, well-lit and covered by campus security.', 10),
  ('Main food court', 'Sample: open daytime hours with plenty of people around.', 20)
) as area(name, description, sort_order)
where u.slug = 'gitam'
on conflict (university_id, name) do nothing;
