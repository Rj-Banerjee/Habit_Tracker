import { supabase } from './supabase';
import { Habit, HabitStreak, StreakMode } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export const trackerService = {
  async listHabits(year: number, month: number): Promise<Habit[]> {
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

    const { data, error } = await supabase
      .from('habits')
      .select('id, identity_id, title, schedule_days, habit_logs(id, habit_id, date, status)')
      .is('archived_at', null)
      .gte('habit_logs.date', from)
      .lte('habit_logs.date', to)
      .order('created_at');

    if (error) throw error;
    return data as Habit[];
  },

  async defaultIdentityId(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('identities')
      .select('id')
      .order('created_at')
      .limit(1);
    if (error) throw error;
    if (data.length > 0) return data[0].id;

    const created = await supabase
      .from('identities')
      .insert({ user_id: userId, name: 'Me' })
      .select('id')
      .single();
    if (created.error) throw created.error;
    return created.data.id;
  },

  async createHabit(userId: string, title: string): Promise<void> {
    const identityId = await this.defaultIdentityId(userId);
    const { error } = await supabase.from('habits').insert({ identity_id: identityId, title });
    if (error) throw error;
  },

  async renameHabit(id: string, title: string): Promise<void> {
    const { error } = await supabase.from('habits').update({ title }).eq('id', id);
    if (error) throw error;
  },

  async deleteHabit(id: string): Promise<void> {
    const { error } = await supabase.from('habits').delete().eq('id', id);
    if (error) throw error;
  },

  async setLog(habitId: string, date: string, done: boolean): Promise<void> {
    const { error } = done
      ? await supabase.rpc('log_habit', { p_habit_id: habitId, p_date: date })
      : await supabase.rpc('undo_log', { p_habit_id: habitId, p_date: date });
    if (error) throw error;
  },

  async getStreaks(): Promise<HabitStreak[]> {
    const { data, error } = await supabase.rpc('get_streaks');
    if (error) throw error;
    return data;
  },

  async getMode(): Promise<StreakMode> {
    const { data, error } = await supabase.from('users').select('mode').single();
    if (error) throw error;
    return data.mode;
  },

  async setMode(userId: string, mode: StreakMode): Promise<void> {
    const { error } = await supabase.from('users').update({ mode }).eq('id', userId);
    if (error) throw error;
  },
};
