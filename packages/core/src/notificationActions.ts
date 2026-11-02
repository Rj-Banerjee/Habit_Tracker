import { HabitLevel, TodayRow, TrackerApi } from './api';
import { levelTarget } from './todayModel';

export const NUDGE_CATEGORY = 'habitnudge';
export const NOTIFICATION_TASK = 'habit-notification-action';

export const NOTIFICATION_ACTIONS: { id: string; title: string; level: HabitLevel }[] = [
  { id: 'done', title: 'Done', level: 'full' },
  { id: 'smaller', title: 'Smaller version', level: 'minimum' },
];

// Returns false for anything that isn't one of our buttons, such as tapping the body.
export async function runNotificationAction(
  api: Pick<TrackerApi, 'logHabit' | 'getToday'>,
  actionId: string,
  habitId: string
): Promise<boolean> {
  const action = NOTIFICATION_ACTIONS.find((item) => item.id === actionId);
  if (!action) return false;
  const rows: TodayRow[] = await api.getToday();
  const row = rows.find((item) => item.habit_id === habitId && item.is_today);
  await api.logHabit(
    habitId,
    row?.day ?? null,
    action.level,
    row ? levelTarget(row, action.level) : null,
    'notification'
  );
  return true;
}
