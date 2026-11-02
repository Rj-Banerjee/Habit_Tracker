import { toggledRows, toggleFromWidget, widgetModel } from '@habit-tracker/core';
import { cachedToday, loadToday, offlineTracker } from '../services/logQueue';
import { supabase } from '../services/supabase';
import type { WidgetState } from './TodayWidget';

const OFFLINE_NOTE = "Offline. It'll sync when you're back.";
const SAVE_FAILED = "That didn't save. Try again.";

// With no connection it shows the last list it had, and says so.
export async function loadWidget(note?: string): Promise<WidgetState> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { kind: 'signedOut' };
  const { rows, offline } = await loadToday();
  return { kind: 'ready', model: widgetModel(rows), note: offline ? OFFLINE_NOTE : note };
}

// Shown straight away, so a tap feels like a tap. Null if there's nothing to go on.
export async function previewToggle(habitId: string): Promise<WidgetState | null> {
  const rows = await cachedToday();
  if (rows.length === 0) return null;
  return { kind: 'ready', model: widgetModel(toggledRows(rows, habitId)) };
}

export async function toggleAndLoad(habitId: string): Promise<WidgetState> {
  try {
    await toggleFromWidget(offlineTracker, await offlineTracker.getToday(), habitId);
    return await loadWidget();
  } catch {
    return loadWidget(SAVE_FAILED);
  }
}
