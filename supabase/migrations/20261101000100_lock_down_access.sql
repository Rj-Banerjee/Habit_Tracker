-- Row-level security for the current tables, and removal of default grants.
-- The API server connects as a role that bypasses RLS. These policies protect
-- direct client access, which is how PLAN.md's clients reach the database.

-- Every table is reachable only by a signed-in owner, never by anon.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant select, update on public.users to authenticated;
grant select, insert, update, delete on public.daily_habits to authenticated;
grant select, insert, update, delete on public.daily_logs to authenticated;
grant select, insert, update, delete on public.weekly_habits to authenticated;
grant select, insert, update, delete on public.monthly_habits to authenticated;
grant select, insert, update, delete on public.monthly_reflections to authenticated;
grant select, insert, update on public.coach_profiles to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;
grant select on public.daily_quote_cache to authenticated;

alter table public.users enable row level security;
alter table public.daily_habits enable row level security;
alter table public.daily_logs enable row level security;
alter table public.weekly_habits enable row level security;
alter table public.monthly_habits enable row level security;
alter table public.monthly_reflections enable row level security;
alter table public.coach_profiles enable row level security;
alter table public.chat_messages enable row level security;
alter table public.daily_quote_cache enable row level security;

create policy users_own on public.users
  for all to authenticated
  using (id = (select auth.uid())::text)
  with check (id = (select auth.uid())::text);

create policy daily_habits_own on public.daily_habits
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

create policy daily_logs_own on public.daily_logs
  for all to authenticated
  using (exists (
    select 1 from public.daily_habits h
    where h.id = habit_id and h.user_id = (select auth.uid())::text
  ))
  with check (exists (
    select 1 from public.daily_habits h
    where h.id = habit_id and h.user_id = (select auth.uid())::text
  ));

create policy weekly_habits_own on public.weekly_habits
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

create policy monthly_habits_own on public.monthly_habits
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

create policy monthly_reflections_own on public.monthly_reflections
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

create policy coach_profiles_own on public.coach_profiles
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

create policy chat_messages_own on public.chat_messages
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

create policy daily_quote_cache_read on public.daily_quote_cache
  for select to authenticated
  using (true);

-- Event-trigger helper created by Supabase. It can't be called directly, but
-- it has no reason to be exposed through the API.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
