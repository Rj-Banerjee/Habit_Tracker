import type { HabitType } from './api';
import { convertAmount, findUnit } from './units';

// Tunnel Vision: one habit, a focus timer, nothing else on screen.

export const DEFAULT_FOCUS_MINUTES = 25;
export const MIN_FOCUS_MINUTES = 1;
export const MAX_FOCUS_MINUTES = 240;
export const FOCUS_FADE_MS = 250;

export type FocusEventKind = 'focus.started' | 'focus.completed' | 'focus.stopped';

const clampMinutes = (minutes: number) =>
  Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(minutes)));

interface FocusHabit {
  habit_type: HabitType;
  target: number | null;
  unit: string | null;
  // What's already done today, in the habit's own unit.
  amount?: number | null;
}

// A duration habit counts focused time: its minutes add to the day. Any other habit is
// logged as done when its focus is.
export const focusAddsTime = (habit: FocusHabit) =>
  habit.habit_type === 'duration' && (!habit.unit || findUnit(habit.unit)?.family === 'time');

const inMinutes = (amount: number, unit: string | null) => convertAmount(amount, unit ?? 'min', 'min') ?? amount;

// A duration habit's own target, less what's already done today, in minutes; or 25.
export function focusMinutes(habit: FocusHabit) {
  if (!focusAddsTime(habit) || !habit.target || habit.target <= 0) return DEFAULT_FOCUS_MINUTES;
  const target = inMinutes(habit.target, habit.unit);
  const done = habit.amount ? inMinutes(habit.amount, habit.unit) : 0;
  // Already done in full: another session of the whole target.
  return clampMinutes(done > 0 && done < target ? target - done : target);
}

// Minutes focused, in the habit's own unit, to add to the day.
export const focusedAmount = (habit: FocusHabit, seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return convertAmount(minutes, 'min', habit.unit ?? 'min') ?? minutes;
};

// asking: stopped early, log the minimum? timeUp: the timer ran out, is it done?
// again: not done yet, focus again? Nothing is logged without an answer.
export type FocusPhase = 'setup' | 'running' | 'paused' | 'asking' | 'timeUp' | 'again' | 'finished';

export interface FocusState {
  phase: FocusPhase;
  minutes: number;
  // When a running timer reaches zero, by the clock, so it stays right if the phone sleeps.
  endsAt: number | null;
  // What was left when paused or stopped.
  remainingMs: number;
}

export type FocusAction =
  | { type: 'setMinutes'; minutes: number }
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'stop'; now: number }
  | { type: 'keepGoing'; now: number }
  // "Done my work", said or tapped: finished, early or at the end.
  | { type: 'workDone'; now: number }
  | { type: 'notDone' }
  | { type: 'focusAgain'; now: number };

export const focusStart = (minutes: number): FocusState => ({
  phase: 'setup',
  minutes: clampMinutes(minutes),
  endsAt: null,
  remainingMs: clampMinutes(minutes) * 60_000,
});

const left = (state: FocusState, now: number) =>
  state.endsAt === null ? state.remainingMs : Math.max(0, state.endsAt - now);

export function focusReducer(state: FocusState, action: FocusAction): FocusState {
  switch (action.type) {
    case 'setMinutes':
      return state.phase === 'setup' ? focusStart(action.minutes) : state;
    case 'start':
      return state.phase === 'setup'
        ? { ...state, phase: 'running', endsAt: action.now + state.remainingMs }
        : state;
    case 'pause':
      return state.phase === 'running'
        ? { ...state, phase: 'paused', endsAt: null, remainingMs: left(state, action.now) }
        : state;
    case 'resume':
      return state.phase === 'paused'
        ? { ...state, phase: 'running', endsAt: action.now + state.remainingMs }
        : state;
    case 'tick':
      return state.phase === 'running' && left(state, action.now) === 0
        ? { ...state, phase: 'timeUp', endsAt: null, remainingMs: 0 }
        : state;
    case 'stop':
      if (state.phase !== 'running' && state.phase !== 'paused') return state;
      // Stopping in the last moment is the timer running out.
      if (left(state, action.now) === 0) return { ...state, phase: 'timeUp', endsAt: null, remainingMs: 0 };
      return { ...state, phase: 'asking', endsAt: null, remainingMs: left(state, action.now) };
    case 'workDone':
      return ['running', 'paused', 'asking', 'timeUp'].includes(state.phase)
        ? { ...state, phase: 'finished', endsAt: null, remainingMs: left(state, action.now) }
        : state;
    case 'notDone':
      return state.phase === 'timeUp' ? { ...state, phase: 'again' } : state;
    case 'focusAgain':
      return state.phase === 'again'
        ? {
            ...state,
            phase: 'running',
            remainingMs: state.minutes * 60_000,
            endsAt: action.now + state.minutes * 60_000,
          }
        : state;
    case 'keepGoing':
      return state.phase === 'asking'
        ? { ...state, phase: 'running', endsAt: action.now + state.remainingMs }
        : state;
  }
}

export const remainingMs = (state: FocusState, now: number) => left(state, now);
export const plannedSeconds = (state: FocusState) => state.minutes * 60;
export const elapsedSeconds = (state: FocusState, now: number) =>
  Math.round((state.minutes * 60_000 - left(state, now)) / 1000);

// The countdown, rounded up so it never shows 00:00 while time is left.
export function clockLabel(ms: number) {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

// Read aloud by screen readers, which don't say "24:59" well.
export function clockSpoken(ms: number) {
  const minutes = Math.ceil(ms / 60_000);
  return minutes === 1 ? '1 minute left' : `${minutes} minutes left`;
}

export const minutesLabel = (minutes: number) => (minutes === 1 ? '1 minute' : `${minutes} minutes`);

export const STOP_QUESTION = 'Log the minimum version?';
// A duration habit counts what was done instead of asking about the minimum.
export const stopQuestionFor = (habit: FocusHabit, seconds: number) => {
  if (!focusAddsTime(habit)) return STOP_QUESTION;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `Add the ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} you focused?`;
};
export const timeUpQuestion = (title: string) => `Time's up. Is ${title} done?`;
export const AGAIN_QUESTION = 'Focus again?';

// What someone says to finish early, in English or Hindi. Plain matching on the phone,
// so it works offline and never sends the words anywhere.
const DONE_PHRASES = [
  /\b(done|finished|completed?)\b.*\b(work|it|task|this)\b/,
  /\b(work|task|it)\b.*\b(is |s )?(done|finished|complete)\b/,
  /^(i'?m |i am |all )?(done|finished)$/,
  /\b(ho gaya|ho gya|khatam|kar liya|kar diya|pura ho gaya)\b/,
];
const NOT_DONE = /\b(not|isn'?t|haven'?t|nahi|nahin)\b/;

export function isDonePhrase(said: string) {
  const text = said.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
  if (!text || NOT_DONE.test(text)) return false;
  return DONE_PHRASES.some((pattern) => pattern.test(text));
}

// A session the phone kept while the app was closed, back as a timer.
export interface SavedFocus {
  minutes: number;
  endAt: number;
  paused: boolean;
  remainingMs: number;
  timeUp: boolean;
}

export function focusFromSaved(saved: SavedFocus, now: number): FocusState {
  const minutes = Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(saved.minutes)));
  if (saved.timeUp || (!saved.paused && saved.endAt <= now)) {
    return { phase: 'timeUp', minutes, endsAt: null, remainingMs: 0 };
  }
  if (saved.paused) return { phase: 'paused', minutes, endsAt: null, remainingMs: Math.max(0, saved.remainingMs) };
  return { phase: 'running', minutes, endsAt: saved.endAt, remainingMs: saved.endAt - now };
}

export const FOCUS_LINK = 'focus';
