-- Habit connections, parts 4 and 6: the morning heads-up, the weekly warning, and
-- Autopilot. See "Habit connections" in PLAN.md.

alter table public.users
  add column heads_up_dismissed_on date,
  add column warning_shown_on date,
  -- Off by default. When on, the AI may make small changes on its own, always with a
  -- notice and Undo.
  add column autopilot boolean not null default false;

-- Today's plan against the links that compete the day after: the habit done yesterday (a
-- big amount, for those links), and the one due today that tends to slip after it.
create function tracker.heads_up_candidates(p_user uuid, p_now timestamptz)
returns table (finding_id uuid, key text, kind text, a_id uuid, a_title text, b_id uuid, b_title text, numbers jsonb)
language sql
stable
set search_path = ''
as $$
  with today as (select tracker.local_date(p_user, p_now) as d)
  select f.id, f.key, f.kind,
         (f.subjects -> 0 ->> 'id')::uuid, f.subjects -> 0 ->> 'title',
         (f.subjects -> 1 ->> 'id')::uuid, f.subjects -> 1 ->> 'title', f.numbers
  from public.findings f
  left join public.finding_answers a on a.user_id = f.user_id and a.key = f.key
  cross join today
  where f.user_id = p_user
    and f.kind in ('next_day', 'after_big_amount', 'skip_reason')
    and f.direction = 'competes'
    and not tracker.hidden_finding(p_user, f.key, p_now)
    -- Done yesterday, and big enough when the link is about big amounts.
    and exists (
      select 1 from public.habit_logs l
      where l.habit_id = (f.subjects -> 0 ->> 'id')::uuid and l.date = today.d - 1 and l.status in ('done', 'repaired')
        and (f.kind <> 'after_big_amount' or coalesce(l.amount, 0) >= (f.numbers ->> 'at_least')::numeric)
    )
    -- Due today, not logged yet, and not already lighter.
    and tracker.is_scheduled((f.subjects -> 1 ->> 'id')::uuid, today.d)
    and not exists (
      select 1 from public.habit_logs l
      where l.habit_id = (f.subjects -> 1 ->> 'id')::uuid and l.date = today.d and l.status <> 'partial'
    )
    and not coalesce(tracker.light_on((f.subjects -> 1 ->> 'id')::uuid, today.d), false)
  order by a.answer = 'yes' desc nulls last, f.confidence = 'high' desc, f.p_value, f.id;
$$;

-- The morning heads-up: one at most, and only before noon.
create function public.get_heads_up()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(c)
  from public.users u
  cross join lateral tracker.heads_up_candidates(u.id, now()) c
  where u.id = tracker.current_user_id()
    and tracker.has_insights(u.id)
    and extract(hour from now() at time zone u.timezone) < 12
    and u.heads_up_dismissed_on is distinct from tracker.local_date(u.id, now())
  limit 1;
$$;

create function public.dismiss_heads_up()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.users set heads_up_dismissed_on = tracker.local_date(id, now()) where id = tracker.current_user_id();
$$;

-- The heads-up's fix: today's goal is the minimum for the habit that tends to slip.
create function public.apply_heads_up(p_finding_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_candidate record;
  v_change uuid;
begin
  if not tracker.has_insights(v_user) then
    raise exception 'Available on Pro.';
  end if;
  select * into v_candidate from tracker.heads_up_candidates(v_user, now()) where finding_id = p_finding_id;
  if v_candidate.finding_id is null then
    raise exception 'Nothing to do today';
  end if;
  v_change := tracker.apply_change(
    v_user, v_candidate.b_id, '{"type": "light_today"}', 'ai_assisted', 'heads_up', v_candidate.key,
    'After ' || v_candidate.a_title || ' yesterday, ' || v_candidate.b_title || '''s goal is the minimum today', now()
  );
  update public.users set heads_up_dismissed_on = tracker.local_date(v_user, now()) where id = v_user;
  return v_change;
end;
$$;

-- A firm, kind warning, for serious and sustained patterns only: an overload that hit two
-- or more habits, one habit linked to several slipping, or two or more habits declining.
-- At most once a week, and snoozable.
create function public.get_warning()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_today date := tracker.local_date(v_user, now());
  v_shown date;
  v_result jsonb;
begin
  if not tracker.has_insights(v_user) then
    return null;
  end if;
  select warning_shown_on into v_shown from public.users where id = v_user;
  if v_shown is not null and v_shown > v_today - 7 then
    return null;
  end if;

  select jsonb_build_object('kind', 'overload', 'habit', f.subjects -> 0 ->> 'title', 'slipping', f.numbers -> 'habits')
  into v_result
  from public.findings f
  where f.user_id = v_user and f.kind = 'overload' and jsonb_array_length(f.numbers -> 'habits') >= 2
    and not tracker.hidden_finding(v_user, f.key, now())
  order by f.p_value
  limit 1;
  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object('kind', 'dragging', 'habit', f.subjects -> 0 ->> 'title',
                            'slipping', jsonb_agg(distinct f.subjects -> 1 ->> 'title'))
  into v_result
  from public.findings f
  where f.user_id = v_user and f.direction = 'competes'
    and f.kind in ('next_day', 'after_big_amount', 'same_day', 'skip_reason')
    and not tracker.hidden_finding(v_user, f.key, now())
  group by f.subjects -> 0 ->> 'id', f.subjects -> 0 ->> 'title'
  having count(distinct f.subjects -> 1 ->> 'id') >= 2
  limit 1;
  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object('kind', 'declining', 'slipping', jsonb_agg(h.title order by h.title))
  into v_result
  from public.insights i join public.habits h on h.id = i.habit_id
  where i.user_id = v_user and i.kind = 'declining'
  having count(*) >= 2;
  return v_result;
end;
$$;

-- Seen, or snoozed: either way, nothing more for a week.
create function public.snooze_warning()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.users set warning_shown_on = tracker.local_date(id, now()) where id = tracker.current_user_id();
$$;

create function public.set_autopilot(p_on boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.users set autopilot = p_on where id = tracker.current_user_id();
$$;

-- Autopilot's nightly work for one person, run by the AI service for Pro people who turned
-- it on: today's goal the minimum after yesterday's draining habit, and a "yes" clash moved
-- to the part of the day its fix names. Each is a change Autopilot is allowed to make, and
-- is returned so the person can be told and undo it.
create function public.job_autopilot(p_user uuid, p_now timestamptz default now())
returns table (change_id uuid, habit_title text, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_fix jsonb;
  v_change uuid;
  v_reason text;
begin
  if not coalesce((select autopilot from public.users where id = p_user), false) then
    return;
  end if;

  for v_candidate in select * from tracker.heads_up_candidates(p_user, p_now) loop
    v_reason := 'After ' || v_candidate.a_title || ' yesterday, ' || v_candidate.b_title || '''s goal is the minimum today';
    v_change := tracker.apply_change(p_user, v_candidate.b_id, '{"type": "light_today"}', 'ai', 'autopilot',
                                     v_candidate.key, v_reason, p_now);
    return query select v_change, v_candidate.b_title, v_reason;
  end loop;

  -- A clash they agreed with, not moved before: its first fix, if it's a move.
  for v_fix in
    select jsonb_build_object('fix', f.fixes -> 0, 'key', f.key, 'title', f.subjects -> 1 ->> 'title')
    from public.findings f
    join public.finding_answers a on a.user_id = f.user_id and a.key = f.key and a.answer = 'yes'
    where f.user_id = p_user and f.kind = 'clash' and f.fixes -> 0 -> 'action' ->> 'type' = 'move_time'
      and not exists (select 1 from public.ai_changes c where c.user_id = p_user and c.source_key = f.key)
  loop
    v_reason := 'Moved ' || (v_fix ->> 'title') || ' to the ' || (v_fix -> 'fix' -> 'action' ->> 'time_of_day')
                || ', so it doesn''t compete for the same time';
    v_change := tracker.apply_change(p_user, (v_fix -> 'fix' ->> 'habit_id')::uuid, v_fix -> 'fix' -> 'action', 'ai',
                                     'autopilot', v_fix ->> 'key', v_reason, p_now);
    return query select v_change, v_fix ->> 'title', v_reason;
  end loop;
end;
$$;

-- Autopilot's changes not yet seen, for the notice on Today.
create function public.get_unseen_ai_changes()
returns table (id uuid, habit_title text, reason text, applied_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, h.title, c.reason, c.applied_at
  from public.ai_changes c join public.habits h on h.id = c.habit_id
  where c.user_id = tracker.current_user_id() and c.actor = 'ai' and c.seen_at is null and c.undone_at is null
  order by c.applied_at desc;
$$;

revoke all on function tracker.heads_up_candidates(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_heads_up() from public, anon;
revoke all on function public.dismiss_heads_up() from public, anon;
revoke all on function public.apply_heads_up(uuid) from public, anon;
revoke all on function public.get_warning() from public, anon;
revoke all on function public.snooze_warning() from public, anon;
revoke all on function public.set_autopilot(boolean) from public, anon;
revoke all on function public.get_unseen_ai_changes() from public, anon;
revoke all on function public.job_autopilot(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_heads_up() to authenticated;
grant execute on function public.dismiss_heads_up() to authenticated;
grant execute on function public.apply_heads_up(uuid) to authenticated;
grant execute on function public.get_warning() to authenticated;
grant execute on function public.snooze_warning() to authenticated;
grant execute on function public.set_autopilot(boolean) to authenticated;
grant execute on function public.get_unseen_ai_changes() to authenticated;
grant execute on function public.job_autopilot(uuid, timestamptz) to service_role;
