-- Plans, and what a game layer will need from the activity history.
--
-- A person's plan decides what they can use (see packages/core/src/entitlements.ts). Only
-- the server sets it: people can read their own plan but never change it.
--
-- A game layer will work out XP and levels by replaying activity_events. It already has
-- every log change with its level, status, amount, source, time and actor, plus repairs,
-- habit moves and focus sessions. It was missing when a habit began and in which identity,
-- and when it was archived, so those are added here and filled in for existing habits.
-- Grace Days aren't events: they're worked out again from the logs each time, and a game
-- can do the same.

create type public.plan as enum ('free', 'pro', 'ultra', 'enterprise');

alter table public.users add column plan public.plan not null default 'free';
-- Belt and braces: update is granted column by column, and never on plan.
revoke update (plan) on public.users from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Habit created, archived and restored
-- ---------------------------------------------------------------------------

create function tracker.record_habit_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := tracker.habit_owner(new.id);
  v_kind text;
begin
  if v_owner is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    v_kind := 'habit_created';
  elsif old.archived_at is null and new.archived_at is not null then
    v_kind := 'habit_archived';
  elsif old.archived_at is not null and new.archived_at is null then
    v_kind := 'habit_restored';
  else
    return null;
  end if;

  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload)
  values (
    v_owner,
    case when tg_op = 'INSERT' then new.created_at else coalesce(new.archived_at, now()) end,
    v_kind,
    new.id,
    jsonb_build_object('identity_id', new.identity_id, 'type', new.type, 'starts_on', new.starts_on)
  );
  return null;
end;
$$;

create trigger habits_record_lifecycle
  after insert or update of archived_at on public.habits
  for each row execute function tracker.record_habit_lifecycle();

-- Habits that already exist get their start, at the time they were made, so a replay
-- of the history starts from the beginning.
insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload)
select i.user_id, h.created_at, 'habit_created', h.id,
       jsonb_build_object('identity_id', h.identity_id, 'type', h.type, 'starts_on', h.starts_on)
from public.habits h
join public.identities i on i.id = h.identity_id
where not exists (
  select 1 from public.activity_events e where e.kind = 'habit_created' and e.subject_id = h.id
);

insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload)
select i.user_id, h.archived_at, 'habit_archived', h.id,
       jsonb_build_object('identity_id', h.identity_id, 'type', h.type, 'starts_on', h.starts_on)
from public.habits h
join public.identities i on i.id = h.identity_id
where h.archived_at is not null
  and not exists (
    select 1 from public.activity_events e where e.kind = 'habit_archived' and e.subject_id = h.id
  );

-- ---------------------------------------------------------------------------
-- Each log event also says which identity the habit belonged to at that moment.
-- ---------------------------------------------------------------------------

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
  v_identity uuid;
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

  select identity_id into v_identity from public.habits where id = v_row.habit_id;

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
      'identity_id', v_identity,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'previous_level', case when tg_op = 'UPDATE' then old.level_done end
    )),
    v_source,
    case when v_source in ('coach', 'voice') then 'ai_assisted' else 'user' end::public.activity_actor
  );
  return null;
end;
$$;
