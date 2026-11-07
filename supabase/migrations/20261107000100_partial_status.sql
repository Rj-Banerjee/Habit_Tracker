-- A day with some progress below the minimum: noted, but not counted. Its own migration,
-- because a new enum value can't be used in the transaction that adds it.
alter type public.log_status add value if not exists 'partial' before 'done';
