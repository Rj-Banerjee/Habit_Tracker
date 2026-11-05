import type { HabitType } from './api';

// Tunnel Vision: one habit, a focus timer, nothing else on screen.

export const DEFAULT_FOCUS_MINUTES = 25;
export const MIN_FOCUS_MINUTES = 1;
export const MAX_FOCUS_MINUTES = 240;
export const FOCUS_FADE_MS = 250;

export type FocusEventKind = 'focus.started' | 'focus.completed' | 'focus.stopped';

const clampMinutes = (minutes: number) =>
  Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(minutes)));

// A duration habit's own target, in minutes, or 25.
export function focusMinutes(habit: { habit_type: HabitType; target: number | null; unit: string | null }) {
  if (habit.habit_type !== 'duration' || !habit.target || habit.target <= 0) return DEFAULT_FOCUS_MINUTES;
  const unit = (habit.unit ?? '').trim().toLowerCase();
  if (/^(h|hr|hrs|hour|hours)$/.test(unit)) return clampMinutes(habit.target * 60);
  if (/^(s|sec|secs|second|seconds)$/.test(unit)) return clampMinutes(habit.target / 60);
  return clampMinutes(habit.target);
}

export type FocusPhase = 'setup' | 'running' | 'paused' | 'asking' | 'finished';

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
  | { type: 'keepGoing'; now: number };

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
        ? { ...state, phase: 'finished', endsAt: null, remainingMs: 0 }
        : state;
    case 'stop':
      if (state.phase !== 'running' && state.phase !== 'paused') return state;
      // Stopping in the last moment counts as finishing.
      if (left(state, action.now) === 0) return { ...state, phase: 'finished', endsAt: null, remainingMs: 0 };
      return { ...state, phase: 'asking', endsAt: null, remainingMs: left(state, action.now) };
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

export const STOP_QUESTION = 'Log the minimum version?';
