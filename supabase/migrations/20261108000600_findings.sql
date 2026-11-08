-- Habit connections: what the pattern engine measured. The AI service finds these each
-- night with plain statistics (no AI) and saves them here; explanations come later and
-- may only use what's stored. See "Habit connections" in PLAN.md.

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null,
  -- The same link keeps its key from night to night, for answers about it.
  key text not null,
  -- The habits and signals involved, in order: [{type: 'habit', id, title} | {type: 'signal', name}].
  subjects jsonb not null,
  direction text not null check (direction in ('helps', 'competes')),
  effect numeric not null,
  sample int not null check (sample > 0),
  confidence text not null check (confidence in ('high', 'medium')),
  range_from date not null,
  range_to date not null,
  -- The supporting numbers, for example 40% of 12 days against 85% of 26 days.
  numbers jsonb not null default '{}',
  p_value numeric not null,
  found_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.findings enable row level security;
create policy findings_owner_read on public.findings
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.findings from anon;
revoke insert, update, delete on table public.findings from authenticated;
grant select on table public.findings to authenticated;

-- What the engine reads for one person: 90 days of analytics, check-ins, and the days
-- habits were added or had their target raised (for overload).
create function public.job_connection_data(p_user uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := tracker.local_date(p_user, p_now);
begin
  perform tracker.settle(p_user, p_now);
  return jsonb_build_object(
    'analytics', tracker.build_analytics(p_user, v_today - 89, v_today, p_now),
    'checkins', coalesce((
      select jsonb_agg(jsonb_build_object('date', c.date, 'energy', c.energy, 'sleep_hours', c.sleep_hours, 'mood', c.mood) order by c.date)
      from public.checkins c
      where c.user_id = p_user and c.date between v_today - 90 and v_today
    ), '[]'),
    'changes', coalesce((
      select jsonb_agg(change order by change ->> 'date')
      from (
        select jsonb_build_object('habit_id', h.id, 'date', h.starts_on, 'kind', 'added') as change
        from public.habits h join public.identities i on i.id = h.identity_id
        where i.user_id = p_user and h.archived_at is null and h.starts_on > v_today - 90
        union all
        select jsonb_build_object(
          'habit_id', v.habit_id, 'date', v.effective_from, 'kind', 'target_raised',
          'from', v.previous_target, 'to', v.target
        )
        from (
          select v.habit_id, v.effective_from, v.target,
                 lag(v.target) over (partition by v.habit_id order by v.effective_from) as previous_target
          from tracker.habit_versions v
          join public.habits h on h.id = v.habit_id
          join public.identities i on i.id = h.identity_id
          where i.user_id = p_user
        ) v
        where v.effective_from > v_today - 90 and v.effective_from <> '-infinity'
          and v.previous_target is not null and v.target > v.previous_target * 1.2
      ) changes
    ), '[]')
  );
end;
$$;

-- Replaces the person's findings with tonight's.
create function public.job_save_findings(p_user uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved int;
begin
  delete from public.findings where user_id = p_user;
  insert into public.findings (
    user_id, kind, key, subjects, direction, effect, sample, confidence, range_from, range_to, numbers, p_value
  )
  select p_user, item ->> 'kind', item ->> 'key', item -> 'subjects', item ->> 'direction',
         (item ->> 'effect')::numeric, (item ->> 'sample')::int, item ->> 'confidence',
         (item ->> 'range_from')::date, (item ->> 'range_to')::date,
         coalesce(item -> 'numbers', '{}'), (item ->> 'p_value')::numeric
  from jsonb_array_elements(coalesce(p_items, '[]')) as item
  -- Only links between the person's own habits.
  where not exists (
    select 1 from jsonb_array_elements(item -> 'subjects') as s
    where s ->> 'type' = 'habit' and tracker.habit_owner((s ->> 'id')::uuid) is distinct from p_user
  );
  get diagnostics v_saved = row_count;
  return v_saved;
end;
$$;

revoke all on function public.job_connection_data(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.job_save_findings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.job_connection_data(uuid, timestamptz) to service_role;
grant execute on function public.job_save_findings(uuid, jsonb) to service_role;

-- Nightly, before insights. Does nothing until the AI service is hosted.
select cron.schedule('ai-nightly-connections', '30 3 * * *', $$ select tracker.call_job('nightly-connections') $$);
