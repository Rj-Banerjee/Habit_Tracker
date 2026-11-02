-- Undo records who asked for it, so a coach undo reads as AI-assisted even when the log
-- it removes was a tap. The source passes through a setting because a deleted row can't
-- carry a new value.
drop function public.undo_log(uuid, date);

create function public.undo_log(
  p_habit_id uuid,
  p_date date default null,
  p_source public.log_source default 'tap'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform set_config('tracker.undo_source', p_source::text, true);
  perform tracker.undo_log(
    v_user, p_habit_id, coalesce(p_date, tracker.local_date(v_user, now())), now()
  );
  perform set_config('tracker.undo_source', '', true);
end;
$$;

revoke all on function public.undo_log(uuid, date, public.log_source) from public, anon;
grant execute on function public.undo_log(uuid, date, public.log_source) to authenticated;

-- Onboarding and the daily reminder.
alter table public.users
  add column onboarded_at timestamptz,
  add column reminder_time time;

-- Everyone who already has a habit has effectively been through it.
update public.users u
set onboarded_at = now()
where exists (
  select 1 from public.identities i
  join public.habits h on h.identity_id = i.id
  where i.user_id = u.id
);

grant update (onboarded_at, reminder_time) on public.users to authenticated;

create or replace function tracker.record_log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.habit_logs := coalesce(new, old);
  v_owner uuid := tracker.habit_owner(v_row.habit_id);
  v_source public.log_source := v_row.source;
begin
  if tg_op = 'DELETE' then
    v_source := coalesce(
      nullif(current_setting('tracker.undo_source', true), '')::public.log_source,
      v_row.source
    );
  end if;

  -- A deleted habit takes its logs with it, and records that once.
  if v_owner is null then
    return null;
  end if;

  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, source, actor)
  values (
    v_owner,
    case when tg_op = 'DELETE' then now() else new.logged_at end,
    case tg_op
      when 'INSERT' then 'log_created'
      when 'UPDATE' then 'log_changed'
      else 'log_removed'
    end,
    v_row.habit_id,
    jsonb_strip_nulls(jsonb_build_object(
      'date', v_row.date,
      'status', v_row.status,
      'level', v_row.level_done,
      'amount', v_row.amount,
      'skip_reason', v_row.skip_reason,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'previous_level', case when tg_op = 'UPDATE' then old.level_done end
    )),
    v_source,
    case when v_source in ('coach', 'voice') then 'ai_assisted' else 'user' end::public.activity_actor
  );
  return null;
end;
$$;
