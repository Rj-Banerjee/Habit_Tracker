import type { SupabaseClient } from '@supabase/supabase-js';
import { asPlan } from './entitlements';
import type { FocusEventKind } from './focus';
import type { ReminderHabit } from './habitReminders';
import type { Insight } from './insights';
import type { AnalyticsData } from './metrics';
import { IdentityToken } from './tokens';

export type HabitLevel = 'full' | 'minimum' | 'setup';
export type HabitType = 'boolean' | 'count' | 'duration' | 'quit';
export type LogStatus = 'partial' | 'done' | 'skipped' | 'repaired';
export type LogSource = 'tap' | 'voice' | 'coach' | 'widget' | 'notification';
export type StreakMode = 'strict' | 'grace';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'anytime';
export type HabitFrequency = 'days' | 'per_week';

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
  time_of_day?: TimeOfDay;
  reminder_time?: string | null;
  frequency?: HabitFrequency;
  // For a times-per-week habit: sessions this week, how many it asks, and the days left
  // that a session can still happen on, today included unless it's done.
  week_done?: number | null;
  week_quota?: number | null;
  week_days_left?: number | null;
  ends_on?: string | null;
  // Where it was dragged to in its section, top first; null if never moved.
  sort_order?: number | null;
}

// One week of a times-per-week habit, for its chain.
export interface WeekStatusRow {
  habit_id: string;
  week_start: string;
  status: 'met' | 'pending' | 'missed' | 'protected' | 'repaired' | 'none';
  quota: number;
  sessions: number;
  // A missed week that can still be repaired: the week to do it in.
  repair_by: string | null;
}

// An ended habit, for Completed habits.
export interface CompletedHabit {
  habit_id: string;
  title: string;
  identity_name: string;
  colour_token: IdentityToken;
  starts_on: string;
  ends_on: string;
  frequency: HabitFrequency;
  days_done: number;
  best_streak: number;
  total_amount: number | null;
  unit: string | null;
  restarted: boolean;
}

// Where a day stands after an amount is added. counted is false when the amount was in a
// unit that can't count toward the habit's, and nothing was logged.
export interface AmountResult {
  counted: boolean;
  added: number;
  total: number;
  unit: string | null;
  said_unit: string | null;
  minimum: number | null;
  target: number | null;
  status: LogStatus | 'none';
  level: HabitLevel | null;
  repaired: boolean;
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
  reminder_time?: string | null;
  frequency?: HabitFrequency;
  per_week?: number | null;
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
  // For "read 20 pages" on the phone: only count and duration habits take an amount.
  type?: HabitType;
  unit?: string | null;
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
  seen_tips?: string[];
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
  time_of_day: TimeOfDay;
  reminder_time: string | null;
  frequency: HabitFrequency;
  per_week: number | null;
  ends_on: string | null;
  starts_on?: string;
  // Weekdays when the minimum is the goal.
  light_days?: number[];
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
  timeOfDay?: TimeOfDay;
  reminderTime?: string | null;
  frequency?: HabitFrequency;
  perWeek?: number | null;
  endsOn?: string | null;
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

    // Adds to the day's total, which decides its status. A range should already be its
    // lower number, and a unit the server can't convert logs nothing.
    addAmount: (
      habitId: string,
      date: string | null,
      amount: number,
      unit: string | null = null,
      source: LogSource = 'tap'
    ) =>
      call<AmountResult>('add_amount', {
        p_habit_id: habitId,
        p_date: date,
        p_amount: amount,
        p_unit: unit,
        p_source: source,
      }),

    // Undo of one added amount.
    removeAmount: (habitId: string, date: string | null, amount: number) =>
      call('remove_amount', { p_habit_id: habitId, p_date: date, p_amount: amount }),

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
        p_time_of_day: input.timeOfDay ?? 'anytime',
        p_reminder_time: input.reminderTime ?? null,
        p_frequency: input.frequency ?? 'days',
        p_per_week: input.frequency === 'per_week' ? (input.perWeek ?? null) : null,
        p_ends_on: input.endsOn ?? null,
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
          time_of_day: changes.timeOfDay,
          reminder_time: changes.reminderTime,
          frequency: changes.frequency,
          per_week: changes.perWeek,
          ends_on: changes.endsOn,
          new_identity: changes.newIdentity && toNewIdentity(changes.newIdentity),
        },
      }),

    archiveHabit: (habitId: string) => call('archive_habit', { p_habit_id: habitId }),

    getHabit: (habitId: string) =>
      select<HabitDetail>(
        client
          .from('habits')
          .select(
            'id, identity_id, title, type, target, unit, schedule_days, voice_aliases, milestone_amount, milestone_label, time_of_day, reminder_time, frequency, per_week, ends_on, starts_on, light_days, habit_levels(level, description, target)'
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
        client.from('habits').select('id, title, voice_aliases, type, unit').is('archived_at', null)
      ),

    listProgressHabits: () =>
      select<ProgressHabit[]>(
        client
          .from('habits')
          .select(
            'id, identity_id, title, type, target, unit, schedule_days, milestone_amount, milestone_label, reminder_time, frequency, per_week, identities(name, colour_token)'
          )
          .is('archived_at', null)
          .order('created_at')
      ),

    // What each habit's own reminder needs.
    listReminderHabits: () =>
      select<ReminderHabit[]>(
        client
          .from('habits')
          .select('id, title, reminder_time, schedule_days, frequency, starts_on, ends_on')
          .is('archived_at', null)
      ),

    getHabitDays: (from: string, to: string) =>
      call<ProgressDay[]>('get_habit_days', { p_from: from, p_to: to }),

    // Unknown or missing plans count as Free, so nothing unlocks by mistake.
    getPlan: async () =>
      asPlan((await select<{ plan: string }>(client.from('users').select('plan').single())).plan),

    getProfile: () =>
      select<Profile>(
        client.from('users').select('timezone, mode, onboarded_at, reminder_time, seen_tips').single()
      ),

    listCompletedHabits: () => call<CompletedHabit[]>('get_completed_habits'),

    // Every habit's days and weeks over a range, for analytics. Cached on the server.
    getAnalytics: (from: string, to: string) => call<AnalyticsData>('get_analytics', { p_from: from, p_to: to }),

    // The order of habits in one section of Today, top first.
    setHabitOrder: (habitIds: string[]) => call('set_habit_order', { p_habit_ids: habitIds }),

    // Insights (Pro): the Overview's when habitId is null. Free gets none from the server.
    getInsights: (habitId: string | null) => call<Insight[]>('get_insights', { p_habit_id: habitId }),
    applyInsight: (id: string) => call('apply_insight', { p_insight_id: id }),
    undoInsight: (id: string) => call('undo_insight', { p_insight_id: id }),
    // Not shown again for 30 days.
    dismissInsight: (id: string) => call('dismiss_insight', { p_insight_id: id }),

    // Weekdays (1 is Monday) when the minimum is the habit's goal. Dated.
    setLightDays: (habitId: string, days: number[]) =>
      call('set_light_days', { p_habit_id: habitId, p_days: days }),

    getWeekStatuses: (from: string, to: string) =>
      call<WeekStatusRow[]>('get_week_statuses', { p_from: from, p_to: to }),

    // A new run of an ended habit, from today. The old run keeps its history.
    restartHabit: (habitId: string) => call<string>('restart_habit', { p_habit_id: habitId }),

    countActiveHabits: async () => {
      const { count, error } = await client
        .from('habits')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null);
      if (error) throw new Error(friendly(error.message));
      return count ?? 0;
    },

    // One-time tips and celebrations, kept on the server so each shows once everywhere.
    markTipSeen: (tip: string) => call('mark_tip_seen', { p_tip: tip }),

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
