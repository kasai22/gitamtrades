-- Allow @gitam.in addresses to sign up and log in alongside @student.gitam.edu.
-- Re-activates the domain if an admin had previously added and disabled it in /admin/universities.

insert into public.university_domains (university_id, domain, note)
select u.id, 'gitam.in', 'GITAM @gitam.in addresses'
from public.universities u
where u.slug = 'gitam'
on conflict (domain) do update set is_active = true;
