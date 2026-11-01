import { IdentityToken } from '../theme/tokens';
import { supabase } from './supabase';

export type HabitLevel = 'full' | 'minimum' | 'setup';
export type HabitType = 'boolean' | 'count' | 'duration' | 'quit';

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

async function call(name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export const tracker = {
  getToday: (): Promise<TodayRow[]> => call('get_today'),

  logHabit: (habitId: string, date: string, level: HabitLevel, amount: number | null) =>
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
};
