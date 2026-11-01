import { RepairRow, TodayRow } from './api';
import { DayPart, isLogged } from './todayModel';

export interface CoachCardContent {
  id: string;
  text: string;
  // What the coach is asked if they tap it.
  prompt: string;
}

// Made on the device from data the app already has, so a card costs no AI call and
// still shows when the AI is down. Only tapping one reaches the coach.
export function coachCard(
  rows: TodayRow[],
  repairs: RepairRow[],
  part: DayPart
): CoachCardContent | null {
  if (repairs.length > 0) {
    const { title } = repairs[0];
    return {
      id: `repair-${repairs[0].habit_id}`,
      text: `${title} slipped, and it can still be repaired.`,
      prompt: `${title} slipped. How do I get back on track?`,
    };
  }

  const today = rows.filter((row) => row.is_today);
  if (today.length === 0) return null;

  const open = today.filter((row) => !isLogged(row));
  if (open.length === 0) {
    return {
      id: 'all-done',
      text: 'Everything is done for today.',
      prompt: 'What went well for me lately?',
    };
  }
  if (part === 'evening') {
    return {
      id: 'evening',
      text: `${open[0].title} is still open. The small version counts.`,
      prompt: `What's the smallest way to do ${open[0].title} tonight?`,
    };
  }
  return {
    id: 'start',
    text: `Not sure where to start? ${open[0].title} is a good first step.`,
    prompt: 'What should I do first today?',
  };
}
