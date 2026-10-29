-- Fix: anonymous visitors must be able to read the public configuration tables (universities,
-- university_domains, categories). Their RLS policies are "is_active or public.is_staff()", and
-- Postgres checks EXECUTE on every function in the policy, so anon needs is_staff() too.
-- is_staff() only inspects the caller's own roles via auth.uid(), so for anon it always returns false.
grant execute on function public.is_staff() to anon;
