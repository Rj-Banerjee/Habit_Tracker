import { HabitLevel, LogSource, TodayRow, TrackerApi } from './api';
import { VoiceAction, VoiceIntent, VoiceOption, VoiceQuestion } from './ai';
import { levelTarget } from './todayModel';

export const VOICE_UNDO_SECONDS = 10;

const SKIP_WITHOUT_A_REASON = 'Not today';
const SOURCE: LogSource = 'voice';

export interface VoiceUndo {
  habitId: string;
  date: string | null;
}

export interface VoiceOutcome {
  say: string;
  undo: VoiceUndo;
}

type Api = Pick<TrackerApi, 'logHabit' | 'skipHabit' | 'getToday'>;

const todayRow = (rows: TodayRow[], habitId: string) =>
  rows.find((row) => row.habit_id === habitId && row.is_today) ??
  rows.find((row) => row.habit_id === habitId);

const withStreak = (text: string, streak?: number) =>
  streak && streak > 1 ? `${text} ${streak}-day streak.` : text;

export function whichQuestion(question: VoiceQuestion): string {
  const titles = question.options.map((option) => option.habit_title);
  return `${titles.slice(0, -1).join(', ')} or ${titles[titles.length - 1]}?`;
}

// Their answer to "which one?" turns the question into the action they asked for.
export function answerWhich(question: VoiceQuestion, option: VoiceOption): VoiceAction {
  const { habit_id, habit_title } = option;
  switch (question.action) {
    case 'log_amount':
      return { intent: 'log_amount', habit_id, habit_title, amount: question.amount ?? 0 };
    case 'skip_habit':
      return { intent: 'skip_habit', habit_id, habit_title, reason: question.reason ?? '' };
    default:
      return { intent: question.action, habit_id, habit_title };
  }
}

export const isVoiceAction = (intent: VoiceIntent): intent is VoiceAction =>
  ['log_habit', 'log_amount', 'shrink_habit', 'skip_habit'].includes(intent.intent);

// Logs through the same rule-checked functions as a tap.
export async function runVoiceAction(
  api: Api,
  action: VoiceAction,
  rows: TodayRow[]
): Promise<VoiceOutcome> {
  const row = todayRow(rows, action.habit_id);
  const date = row?.day ?? null;
  const undo = { habitId: action.habit_id, date };
  const title = action.habit_title;

  if (action.intent === 'skip_habit') {
    const reason = action.reason.trim() || SKIP_WITHOUT_A_REASON;
    await api.skipHabit(action.habit_id, date, reason, SOURCE);
    return { say: `Skipped ${title}.`, undo };
  }

  const log = async (level: HabitLevel, amount: number | null) => {
    await api.logHabit(action.habit_id, date, level, amount, SOURCE);
    return todayRow(await api.getToday(), action.habit_id)?.current_streak;
  };

  if (action.intent === 'log_amount') {
    const short = row?.target != null && action.amount < row.target;
    const streak = await log(short ? 'minimum' : 'full', action.amount);
    const unit = row?.unit ? ` ${row.unit}` : '';
    return { say: withStreak(`Logged ${action.amount}${unit} of ${title}.`, streak), undo };
  }

  const level: HabitLevel = action.intent === 'shrink_habit' ? 'minimum' : 'full';
  const streak = await log(level, row ? levelTarget(row, level) : null);
  const said = level === 'minimum' ? `Logged the minimum for ${title}.` : `Logged ${title}.`;
  return { say: withStreak(said, streak), undo };
}
