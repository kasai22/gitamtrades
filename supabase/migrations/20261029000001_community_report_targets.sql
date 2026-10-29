-- Community (forum) posts and comments can be reported. Enum values are added in their own migration
-- because a new enum value can't be used in the same transaction that adds it.
alter type public.report_target add value if not exists 'post';
alter type public.report_target add value if not exists 'comment';
