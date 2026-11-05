import { HabitLevel, LogSource, TodayRow, TrackerApi, VoiceHabit } from './api';
import { VoiceAction, VoiceIntent, VoiceOption, VoiceQuestion } from './ai';
import { isLogged, levelTarget } from './todayModel';

export const VOICE_UNDO_SECONDS = 10;

// Passed to the phone's recogniser so it favours these over similar-sounding words.
export const VOICE_COMMAND_WORDS = [
  'undo', 'skip', 'log', 'done', 'finished', 'shrink', 'minimum', 'cancel',
  'ho gaya', 'kar liya', 'chhod do', 'wapas', 'thoda',
];

export const VOICE_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' },
] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]['code'];

const SKIP_WITHOUT_A_REASON = 'Not today';

export interface VoiceUndo {
  habitId: string;
  date: string | null;
}

export interface VoiceOutcome {
  say: string;
  // Null when there's nothing to take back.
  undo: VoiceUndo | null;
}

// Voice and the coach both act through here, so they can't drift apart.
export type ActionApi = Pick<TrackerApi, 'logHabit' | 'skipHabit' | 'undoLog' | 'getToday'>;

// Undo must work when the AI doesn't, so these never leave the phone.
export const isUndoPhrase = (text: string) =>
  /^(please )?(undo|take (that|it) back)( that| it| the last one)?( please)?[.!]?$/i.test(text.trim());

const SAID_IT = [
  /^(?:i )?(?:did|finished|completed|done with|just did|just finished)(?: my| the)? (.+)$/,
  /^(?:my |the )?(.+?) (?:is )?(?:done|finished|complete|completed|ho gaya|kar liya)$/,
];

// "done with Read" works with no connection and costs nothing. Only an exact name counts:
// anything less goes to the parser, which can ask.
export function matchSimplePhrase(text: string, habits: VoiceHabit[]): VoiceAction | null {
  const said = text.trim().toLowerCase().replace(/[.!]$/, '');
  for (const pattern of SAID_IT) {
    const name = pattern.exec(said)?.[1];
    if (!name) continue;
    const found = habits.filter((habit) =>
      [habit.title, ...habit.voice_aliases].some((option) => option.toLowerCase() === name)
    );
    if (found.length === 1) {
      return { intent: 'log_habit', habit_id: found[0].id, habit_title: found[0].title };
    }
  }
  return null;
}

const todayRow = (rows: TodayRow[], habitId: string) =>
  rows.find((row) => row.habit_id === habitId && row.is_today) ??
  rows.find((row) => row.habit_id === habitId);

const withStreak = (text: string, streak?: number) =>
  streak && streak > 1 ? `${text} ${streak}-day streak.` : text;

export function whichQuestion(question: VoiceQuestion): string {
  const titles = question.options.map((option) => option.habit_title);
  return `${titles.slice(0, -1).join(', ')} or ${titles[titles.length - 1]}?`;
}

export interface ActionsDone {
  say: string;
  undos: VoiceUndo[];
}

export async function runVoiceActions(
  api: ActionApi,
  actions: VoiceAction[],
  rows: TodayRow[],
  source: LogSource
): Promise<ActionsDone> {
  const outcomes: VoiceOutcome[] = [];
  for (const action of actions) outcomes.push(await runVoiceAction(api, action, rows, source));
  return {
    say: outcomes.map((outcome) => outcome.say).join(' '),
    undos: outcomes.flatMap((outcome) => (outcome.undo ? [outcome.undo] : [])),
  };
}

export async function undoActions(api: ActionApi, undos: VoiceUndo[], source: LogSource) {
  for (const { habitId, date } of undos) await api.undoLog(habitId, date, source);
}

export const noHabitMessage = (name: string) => `You don't have a habit called ${name}.`;
export const OFF_TOPIC_MESSAGE =
  "That doesn't sound like a habit update. Try something like 'I read 20 pages'.";

// "Heard: undi the read → understood as: Undo Read"
export function heardLine(heard: string, corrected: string, intents: VoiceIntent[]) {
  if (corrected.trim().toLowerCase() === heard.trim().toLowerCase()) return `Heard: ${heard}`;
  return `Heard: ${heard} → understood as: ${describeIntents(intents)}`;
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

function describeIntent(intent: VoiceIntent): string {
  switch (intent.intent) {
    case 'log_habit':
      return `Log ${intent.habit_title}`;
    case 'log_amount':
      return `Log ${intent.amount} of ${intent.habit_title}`;
    case 'shrink_habit':
      return `Log the minimum for ${intent.habit_title}`;
    case 'skip_habit':
      return `Skip ${intent.habit_title}`;
    case 'undo_habit':
      return `Undo ${intent.habit_title}`;
    case 'undo_last':
      return 'Undo the last log';
    case 'ask_coach':
      return `Ask the coach: ${intent.question}`;
    case 'ask_which':
      return whichQuestion(intent);
  }
}

// For "Did you mean: Undo the last log?"
export const describeIntents = (intents: VoiceIntent[]) =>
  intents.map(describeIntent).join(' and ');

export const isVoiceAction = (intent: VoiceIntent): intent is VoiceAction =>
  ['log_habit', 'log_amount', 'shrink_habit', 'skip_habit', 'undo_habit'].includes(intent.intent);

// Logs through the same rule-checked functions as a tap.
export async function runVoiceAction(
  api: ActionApi,
  action: VoiceAction,
  rows: TodayRow[],
  source: LogSource = 'voice'
): Promise<VoiceOutcome> {
  const row = todayRow(rows, action.habit_id);
  const date = row?.day ?? null;
  const undo = { habitId: action.habit_id, date };
  const title = action.habit_title;

  if (action.intent === 'undo_habit') {
    if (!row || !isLogged(row)) return { say: `${title} isn't logged today.`, undo: null };
    await api.undoLog(action.habit_id, date, source);
    return { say: `Undid ${title}.`, undo: null };
  }

  if (action.intent === 'skip_habit') {
    const reason = action.reason.trim() || SKIP_WITHOUT_A_REASON;
    await api.skipHabit(action.habit_id, date, reason, source);
    return { say: `Skipped ${title}.`, undo };
  }

  const log = async (level: HabitLevel, amount: number | null) => {
    await api.logHabit(action.habit_id, date, level, amount, source);
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
