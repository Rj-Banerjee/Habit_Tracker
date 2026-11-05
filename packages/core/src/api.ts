import type { SupabaseClient } from '@supabase/supabase-js';
import type { FocusEventKind } from './focus';
import { IdentityToken } from './tokens';

export type HabitLevel = 'full' | 'minimum' | 'setup';
export type HabitType = 'boolean' | 'count' | 'duration' | 'quit';
export type LogStatus = 'done' | 'skipped' | 'repaired';
export type LogSource = 'tap' | 'voice' | 'coach' | 'widget' | 'notification';
export type StreakMode = 'strict' | 'grace';

export interface LevelOption {
  level: HabitLevel;
  description: string;
  target: number | null;
}

export interface TodayRow {
  day: string;
  is_today: boolean;
  habit_id: string;
  identity_id: string;
  identity_name: string;
  colour_token: IdentityToken;
  title: string;
  habit_type: HabitType;
  target: number | null;
  unit: string | null;
  status: string;
  level_done: HabitLevel | null;
  amount: number | null;
  skip_reason: string | null;
  current_streak: number;
  levels: LevelOption[];
  can_repair: boolean;
  repair_amount: number | null;
}

export interface RepairRow {
  habit_id: string;
  identity_id: string;
  identity_name: string;
  colour_token: IdentityToken;
  title: string;
  missed_on: string;
  repair_on: string;
  current_streak: number;
}

export interface HabitStreak {
  habit_id: string;
  current_streak: number;
  longest_streak: number;
  today_status: string;
}

export interface DayStatus {
  habit_id: string;
  date: string;
  status: string;
  repair_on: string | null;
}

export interface HabitAllowance {
  allowed: number;
  active: number;
  can_add: boolean;
}

export interface Identity {
  id: string;
  name: string;
  colour_token: IdentityToken;
  why_text: string | null;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;
  status: LogStatus;
  level_done: HabitLevel | null;
  amount?: number | null;
}

export interface RangeHabit {
  id: string;
  identity_id: string;
  title: string;
  type?: HabitType;
  target?: number | null;
  unit?: string | null;
  identities: { name: string; colour_token: IdentityToken };
  habit_levels: LevelOption[];
  habit_logs: HabitLog[];
}

export interface ProgressHabit {
  id: string;
  identity_id: string;
  title: string;
  type: HabitType;
  target: number | null;
  unit: string | null;
  schedule_days: number[];
  milestone_amount: number | null;
  milestone_label: string | null;
  identities: { name: string; colour_token: IdentityToken };
}

// One scheduled day, with the target that applied on it.
export interface ProgressDay {
  habit_id: string;
  date: string;
  status: string;
  level_done: HabitLevel | null;
  amount: number | null;
  target: number | null;
  // Null for a back-log, which says when they caught up, not when they did it.
  logged_hour?: number | null;
}

export interface VoiceHabit {
  id: string;
  title: string;
  voice_aliases: string[];
}

export interface FutureLetter {
  week_start: string;
  text: string;
}

export interface Profile {
  timezone: string;
  mode: StreakMode;
  onboarded_at: string | null;
  reminder_time: string | null;
}

export interface Reflection {
  week_start: string;
  wins: string[];
  month_note: string | null;
  mood_line: string | null;
}

export interface HabitDetail {
  id: string;
  identity_id: string;
  title: string;
  type: HabitType;
  target: number | null;
  unit: string | null;
  schedule_days: number[];
  voice_aliases: string[];
  milestone_amount: number | null;
  milestone_label: string | null;
  habit_levels: LevelOption[];
}

export interface HabitInput {
  identityId: string;
  title: string;
  levels: LevelOption[];
  type?: HabitType;
  target?: number | null;
  unit?: string | null;
  scheduleDays?: number[];
  windowStart?: string | null;
  windowEnd?: string | null;
  voiceAliases?: string[];
  milestoneAmount?: number | null;
  milestoneLabel?: string | null;
}

export interface NewIdentityInput {
  name: string;
  colourToken: IdentityToken;
  whyText?: string;
}

// Leaving a field out keeps it, and null clears it. newIdentity moves the habit
// to an identity created in the same save.
export type HabitChanges = Partial<Omit<HabitInput, 'type'>> & { newIdentity?: NewIdentityInput };

const toNewIdentity = (identity: NewIdentityInput) => ({
  name: identity.name,
  colour_token: identity.colourToken,
  why_text: identity.whyText ?? null,
});

export const OFFLINE_MESSAGE = "Can't reach the server. Check your connection and try again.";
export const isOfflineError = (error: unknown) =>
  error instanceof Error && error.message === OFFLINE_MESSAGE;

const OFFLINE = /Failed to fetch|Network request failed|NetworkError|Load failed/;

// The network layer's own wording means nothing to the person using the app.
const friendly = (message: string) => (OFFLINE.test(message) ? OFFLINE_MESSAGE : message);

export function createTrackerApi(client: SupabaseClient) {
  const call = async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(friendly(error.message));
    return data as T;
  };

  const select = async <T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await query;
    if (error) throw new Error(friendly(error.message));
    return data as T;
  };

  return {
    getToday: () => call<TodayRow[]>('get_today'),
    getRepairs: () => call<RepairRow[]>('get_repairs'),
    getStreaks: () => call<HabitStreak[]>('get_streaks'),
    getGraceBank: () => call<number>('get_grace_bank'),
    getDayStatuses: (from: string, to: string) =>
      call<DayStatus[]>('get_day_statuses', { p_from: from, p_to: to }),

    // A null date means today, in the person's timezone.
    logHabit: (
      habitId: string,
      date: string | null,
      level: HabitLevel = 'full',
      amount: number | null = null,
      source: LogSource = 'tap'
    ) =>
      call('log_habit', {
        p_habit_id: habitId,
        p_date: date,
        p_level: level,
        p_amount: amount,
        p_source: source,
      }),

    undoLog: (habitId: string, date: string | null, source: LogSource = 'tap') =>
      call('undo_log', { p_habit_id: habitId, p_date: date, p_source: source }),

    skipHabit: (habitId: string, date: string | null, reason: string, source: LogSource = 'tap') =>
      call('skip_habit', {
        p_habit_id: habitId,
        p_date: date,
        p_reason: reason,
        p_source: source,
      }),

    repairHabit: (habitId: string, date: string, amount: number | null) =>
      call('repair_habit', {
        p_habit_id: habitId,
        p_date: date,
        p_amount: amount,
        p_full_and_minimum: amount === null,
      }),

    // Tunnel Vision's start, finish or early stop, for the activity history.
    recordFocus: (habitId: string, kind: FocusEventKind, plannedSeconds: number, elapsedSeconds: number | null = null) =>
      call('record_focus', {
        p_habit_id: habitId,
        p_kind: kind,
        p_planned_seconds: plannedSeconds,
        p_elapsed_seconds: elapsedSeconds,
      }),

    getHabitAllowance: async () => (await call<HabitAllowance[]>('get_habit_allowance'))[0],

    // A new identity saves with the habit, so a refused habit leaves nothing behind.
    createHabit: (input: HabitInput, newIdentity?: NewIdentityInput) =>
      call<string>('create_habit', {
        p_identity_id: newIdentity ? null : input.identityId,
        p_new_identity: newIdentity ? toNewIdentity(newIdentity) : null,
        p_title: input.title,
        p_levels: input.levels,
        p_type: input.type ?? 'boolean',
        p_target: input.target ?? null,
        p_unit: input.unit ?? null,
        p_schedule_days: input.scheduleDays ?? [1, 2, 3, 4, 5, 6, 7],
        p_window_start: input.windowStart ?? null,
        p_window_end: input.windowEnd ?? null,
        p_voice_aliases: input.voiceAliases ?? [],
        p_milestone_amount: input.milestoneAmount ?? null,
        p_milestone_label: input.milestoneLabel ?? null,
      }),

    // Changes apply from today, never to past days. A moved habit keeps its logs.
    updateHabit: (habitId: string, changes: HabitChanges) =>
      call('update_habit', {
        p_habit_id: habitId,
        p_changes: {
          title: changes.title,
          target: changes.target,
          unit: changes.unit,
          schedule_days: changes.scheduleDays,
          window_start: changes.windowStart,
          window_end: changes.windowEnd,
          voice_aliases: changes.voiceAliases,
          milestone_amount: changes.milestoneAmount,
          milestone_label: changes.milestoneLabel,
          levels: changes.levels,
          identity_id: changes.identityId,
          new_identity: changes.newIdentity && toNewIdentity(changes.newIdentity),
        },
      }),

    archiveHabit: (habitId: string) => call('archive_habit', { p_habit_id: habitId }),

    getHabit: (habitId: string) =>
      select<HabitDetail>(
        client
          .from('habits')
          .select(
            'id, identity_id, title, type, target, unit, schedule_days, voice_aliases, milestone_amount, milestone_label, habit_levels(level, description, target)'
          )
          .eq('id', habitId)
          .single()
      ),

    listIdentities: () =>
      select<Identity[]>(
        client.from('identities').select('id, name, colour_token, why_text').order('created_at')
      ),

    updateIdentityWhy: (identityId: string, whyText: string | null) =>
      select(client.from('identities').update({ why_text: whyText }).eq('id', identityId)),

    getLatestLetter: async () => {
      const rows = await select<{ payload: FutureLetter }[]>(
        client
          .from('coach_events')
          .select('payload')
          .eq('kind', 'letter')
          .order('sent_at', { ascending: false })
          .limit(1)
      );
      return rows[0]?.payload ?? null;
    },

    // Newest first, for deciding whether a habit should get another nudge.
    listNudgeHistory: async () => {
      const rows = await select<{ payload: { habit_id: string }; outcome: 'logged' | 'ignored' }[]>(
        client
          .from('coach_events')
          .select('payload, outcome')
          .eq('kind', 'nudge')
          .order('sent_at', { ascending: false })
          .limit(30)
      );
      return rows.map((row) => ({ habit_id: row.payload.habit_id, outcome: row.outcome }));
    },

    listHabitsInRange: (from: string, to: string) =>
      select<RangeHabit[]>(
        client
          .from('habits')
          .select(
            'id, identity_id, title, type, target, unit, identities(name, colour_token), habit_levels(level, description, target), habit_logs(id, habit_id, date, status, level_done, amount)'
          )
          .is('archived_at', null)
          .gte('habit_logs.date', from)
          .lte('habit_logs.date', to)
          .order('created_at')
      ),

    // The words speech recognition should listen out for.
    listVoiceHabits: () =>
      select<VoiceHabit[]>(
        client.from('habits').select('id, title, voice_aliases').is('archived_at', null)
      ),

    listProgressHabits: () =>
      select<ProgressHabit[]>(
        client
          .from('habits')
          .select(
            'id, identity_id, title, type, target, unit, schedule_days, milestone_amount, milestone_label, identities(name, colour_token)'
          )
          .is('archived_at', null)
          .order('created_at')
      ),

    getHabitDays: (from: string, to: string) =>
      call<ProgressDay[]>('get_habit_days', { p_from: from, p_to: to }),

    getProfile: () =>
      select<Profile>(
        client.from('users').select('timezone, mode, onboarded_at, reminder_time').single()
      ),

    setReminderTime: (userId: string, time: string | null) =>
      select(client.from('users').update({ reminder_time: time }).eq('id', userId)),

    finishOnboarding: (userId: string) =>
      select(
        client.from('users').update({ onboarded_at: new Date().toISOString() }).eq('id', userId)
      ),

    getReflection: async (weekStart: string) => {
      const rows = await select<Reflection[]>(
        client
          .from('reflections')
          .select('week_start, wins, month_note, mood_line')
          .eq('week_start', weekStart)
      );
      return rows[0] ?? null;
    },

    saveReflection: (userId: string, reflection: Reflection) =>
      select(
        client
          .from('reflections')
          .upsert({ user_id: userId, ...reflection }, { onConflict: 'user_id,week_start' })
      ),

    getMode: async () =>
      (await select<{ mode: StreakMode }>(client.from('users').select('mode').single())).mode,

    setMode: (userId: string, mode: StreakMode) =>
      select(client.from('users').update({ mode }).eq('id', userId)),
  };
}

export type TrackerApi = ReturnType<typeof createTrackerApi>;
