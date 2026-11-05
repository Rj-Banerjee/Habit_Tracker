import { TodayRow, TrackerApi } from './api';
import { IdentityToken } from './tokens';
import { isLogged, levelTarget, progressLabel } from './todayModel';

export const WIDGET_NAME = 'Today';
export const WIDGET_TOGGLE = 'TOGGLE';
export const VOICE_LINK = 'habittracker://voice';
const WIDGET_MAX_ROWS = 4;

export interface WidgetItem {
  habitId: string;
  title: string;
  done: boolean;
  identity: IdentityToken;
}

export interface WidgetModel {
  summary: string;
  items: WidgetItem[];
  // Habits that didn't fit.
  more: number;
}

// Rows keep their places, or a second tap could land on a different habit. If there are
// too many to show, the open ones are the ones that make the cut.
export function widgetModel(rows: TodayRow[]): WidgetModel {
  const today = rows.filter((row) => row.is_today);
  const items = today.map((row) => ({
    habitId: row.habit_id,
    title: row.title,
    done: isLogged(row),
    identity: row.colour_token,
  }));
  const shown = [...items]
    .sort((a, b) => Number(a.done) - Number(b.done))
    .slice(0, WIDGET_MAX_ROWS);
  return {
    summary: progressLabel(today) || 'Today',
    items: items.filter((item) => shown.includes(item)),
    more: Math.max(0, items.length - WIDGET_MAX_ROWS),
  };
}

// What a tap will do, to show before the server has answered.
export function toggledRows(rows: TodayRow[], habitId: string): TodayRow[] {
  return rows.map((row) => {
    if (row.habit_id !== habitId || !row.is_today) return row;
    return isLogged(row)
      ? { ...row, status: 'pending', level_done: null }
      : { ...row, status: 'done', level_done: 'full' };
  });
}

// One tap logs the full version, and a second takes it back, as on Today.
export async function toggleFromWidget(
  api: Pick<TrackerApi, 'logHabit' | 'undoLog'>,
  rows: TodayRow[],
  habitId: string
) {
  const row = rows.find((item) => item.habit_id === habitId && item.is_today);
  if (!row) return;
  if (isLogged(row)) await api.undoLog(row.habit_id, row.day, 'widget');
  else await api.logHabit(row.habit_id, row.day, 'full', levelTarget(row, 'full'), 'widget');
}
