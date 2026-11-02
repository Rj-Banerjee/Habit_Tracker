import AsyncStorage from '@react-native-async-storage/async-storage';
import { TodayRow, toggledRows, toggleFromWidget, widgetModel } from '@habit-tracker/core';
import { supabase } from '../services/supabase';
import { tracker } from '../services/tracker';
import type { WidgetState } from './TodayWidget';

const CACHE_KEY = 'widget-today';
const OFFLINE_NOTE = "Couldn't update just now.";
const SAVE_FAILED = "That didn't save. Try again.";

const cached = async () => {
  const saved = await AsyncStorage.getItem(CACHE_KEY);
  return saved ? (JSON.parse(saved) as TodayRow[]) : [];
};

// With no connection it shows the last list it had, and says so.
export async function loadWidget(note?: string): Promise<WidgetState> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { kind: 'signedOut' };
  try {
    const rows = await tracker.getToday();
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    return { kind: 'ready', model: widgetModel(rows), note };
  } catch {
    return { kind: 'ready', model: widgetModel(await cached()), note: OFFLINE_NOTE };
  }
}

// Shown straight away, so a tap feels like a tap. Null if there's nothing to go on.
export async function previewToggle(habitId: string): Promise<WidgetState | null> {
  const rows = await cached();
  if (rows.length === 0) return null;
  return { kind: 'ready', model: widgetModel(toggledRows(rows, habitId)) };
}

export async function toggleAndLoad(habitId: string): Promise<WidgetState> {
  try {
    await toggleFromWidget(tracker, await tracker.getToday(), habitId);
    return await loadWidget();
  } catch {
    return loadWidget(SAVE_FAILED);
  }
}
