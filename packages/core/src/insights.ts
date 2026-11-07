import type { TimeOfDay } from './api';

// AI insights for analytics (Pro). The AI service finds and words them each night; see
// "Insights (Pro)" in PLAN.md. This is what the cards say about their one action.

export type InsightAction =
  | { type: 'light_day'; weekday: number; habit_id?: string }
  | { type: 'move_time'; time_of_day: TimeOfDay; habit_id?: string }
  | { type: 'change_target'; target: number; habit_id?: string }
  | { type: 'switch_per_week'; per_week: number; habit_id?: string }
  | { type: 'add_reminder'; reminder_time: string; habit_id?: string };

export interface Insight {
  id: string;
  habit_id: string | null;
  kind: string;
  text: string;
  numbers: Record<string, unknown>;
  action: InsightAction | null;
  applied_at: string | null;
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const clock = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const twelve = h % 12 || 12;
  return `${twelve}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};

// The button.
export function insightActionLabel(action: InsightAction): string {
  switch (action.type) {
    case 'light_day':
      return `Make ${WEEKDAY_NAMES[action.weekday - 1]}s lighter`;
    case 'move_time':
      return action.time_of_day === 'anytime' ? 'Move to any time' : `Move to the ${action.time_of_day}`;
    case 'change_target':
      return `Set the target to ${action.target}`;
    case 'switch_per_week':
      return `Switch to ${action.per_week} times a week`;
    case 'add_reminder':
      return `Move the reminder to ${clock(action.reminder_time)}`;
  }
}

// What's asked before it's done, so nothing changes on one stray tap.
export function insightConfirm(action: InsightAction, habitTitle: string): string {
  switch (action.type) {
    case 'light_day':
      return `On ${WEEKDAY_NAMES[action.weekday - 1]}s, ${habitTitle}'s minimum becomes the goal, from today on. Earlier days stay as they were.`;
    case 'move_time':
      return `${habitTitle} moves to ${action.time_of_day === 'anytime' ? 'any time' : `the ${action.time_of_day}`} on Today.`;
    case 'change_target':
      return `${habitTitle}'s target becomes ${action.target}, from today on. Earlier days keep their target.`;
    case 'switch_per_week':
      return `${habitTitle} becomes ${action.per_week} times a week, counted by the week from today on.`;
    case 'add_reminder':
      return `${habitTitle}'s reminder moves to ${clock(action.reminder_time)}.`;
  }
}

export const INSIGHTS_LOCKED = 'Insights are available on Pro.';
