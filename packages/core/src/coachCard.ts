import { RepairRow, TodayRow } from './api';
import { DayPart, isLogged } from './todayModel';

export interface CoachCardContent {
  id: string;
  // What tapping it opens.
  opens: 'coach' | 'miss' | 'sunday';
  text: string;
  // What the coach is asked if they tap it.
  prompt: string;
}

const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

// Made on the device from data the app already has, so a card costs no AI call and
// still shows when the AI is down. Only tapping one reaches the coach.
export function coachCard(
  rows: TodayRow[],
  repairs: RepairRow[],
  part: DayPart,
  // On Sundays, the weekly report's headline, once it has loaded.
  weekHeadline?: string
): CoachCardContent | null {
  if (repairs.length > 0) {
    const { title } = repairs[0];
    return {
      id: `repair-${repairs[0].habit_id}`,
      opens: 'miss',
      text: `${title} slipped, and it can still be repaired.`,
      prompt: `${title} slipped. How do I get back on track?`,
    };
  }

  const today = rows.filter((row) => row.is_today);
  if (today.length === 0) return null;

  if (isSunday(today[0].day)) {
    return {
      id: 'sunday',
      opens: 'sunday',
      text: weekHeadline ?? 'Your week is ready to look back on.',
      prompt: '',
    };
  }

  const open = today.filter((row) => !isLogged(row));
  if (open.length === 0) {
    return {
      id: 'all-done',
      opens: 'coach',
      text: 'Everything is done for today.',
      prompt: 'What went well for me lately?',
    };
  }
  if (part === 'evening') {
    return {
      id: 'evening',
      opens: 'coach',
      text: `${open[0].title} is still open. The small version counts.`,
      prompt: `What's the smallest way to do ${open[0].title} tonight?`,
    };
  }
  return {
    id: 'start',
    opens: 'coach',
    text: `Not sure where to start? ${open[0].title} is a good first step.`,
    prompt: 'What should I do first today?',
  };
}
