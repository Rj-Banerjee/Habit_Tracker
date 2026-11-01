import type { SupabaseClient } from '@supabase/supabase-js';
import { IdentityToken } from './tokens';

export type HabitLevel = 'full' | 'minimum' | 'setup';
export type HabitType = 'boolean' | 'count' | 'duration' | 'quit';
export type LogStatus = 'done' | 'skipped' | 'repaired';
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
}

export interface RangeHabit {
  id: string;
  identity_id: string;
  title: string;
  identities: { name: string; colour_token: IdentityToken };
  habit_levels: LevelOption[];
  habit_logs: HabitLog[];
}

export interface Profile {
  timezone: string;
  mode: StreakMode;
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

const OFFLINE = /Failed to fetch|Network request failed|NetworkError|Load failed/;

// The network layer's own wording means nothing to the person using the app.
const friendly = (message: string) =>
  OFFLINE.test(message) ? "Can't reach the server. Check your connection and try again." : message;

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

    logHabit: (habitId: string, date: string, level: HabitLevel = 'full', amount: number | null = null) =>
      call('log_habit', { p_habit_id: habitId, p_date: date, p_level: level, p_amount: amount }),

    undoLog: (habitId: string, date: string) =>
      call('undo_log', { p_habit_id: habitId, p_date: date }),

    skipHabit: (habitId: string, date: string, reason: string) =>
      call('skip_habit', { p_habit_id: habitId, p_date: date, p_reason: reason }),

    repairHabit: (habitId: string, date: string, amount: number | null) =>
      call('repair_habit', {
        p_habit_id: habitId,
        p_date: date,
        p_amount: amount,
        p_full_and_minimum: amount === null,
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

    listHabitsInRange: (from: string, to: string) =>
      select<RangeHabit[]>(
        client
          .from('habits')
          .select(
            'id, identity_id, title, identities(name, colour_token), habit_levels(level, description, target), habit_logs(id, habit_id, date, status, level_done)'
          )
          .is('archived_at', null)
          .gte('habit_logs.date', from)
          .lte('habit_logs.date', to)
          .order('created_at')
      ),

    getProfile: () =>
      select<Profile>(client.from('users').select('timezone, mode').single()),

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
