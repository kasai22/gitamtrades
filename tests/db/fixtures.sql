-- Test-only fixture: a second, fictional university so database tests are independent of the
-- production launch university (GITAM, added by migration 0006).

insert into public.universities (id, slug, name, short_name, city)
values ('00000000-0000-4000-8000-000000000001', 'example-university', 'Example University', 'EU', 'Visakhapatnam')
on conflict (id) do nothing;

insert into public.university_domains (university_id, domain, note) values
  ('00000000-0000-4000-8000-000000000001', 'example.edu.in', 'Placeholder student domain'),
  ('00000000-0000-4000-8000-000000000001', 'students.example.edu.in', 'Placeholder student subdomain')
on conflict (domain) do nothing;

insert into public.meetup_areas (university_id, name, description, sort_order) values
  ('00000000-0000-4000-8000-000000000001', 'Central Library entrance', 'Busy, well-lit and covered by campus security.', 10),
  ('00000000-0000-4000-8000-000000000001', 'Main food court', 'Open daytime hours; plenty of people around.', 20),
  ('00000000-0000-4000-8000-000000000001', 'Academic Block A lobby', 'Indoor seating near the reception desk.', 30),
  ('00000000-0000-4000-8000-000000000001', 'Sports complex gate', 'Good for cycles and sports equipment.', 40)
on conflict (university_id, name) do nothing;
