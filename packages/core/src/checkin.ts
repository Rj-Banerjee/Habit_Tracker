// The daily check-in: energy and mood from 1 to 5, and hours slept. On every plan, and
// optional. See "Habit connections" in PLAN.md.

export type CheckinTime = 'morning' | 'evening' | 'off';

export interface Checkin {
  date: string;
  energy: number | null;
  sleep_hours: number | null;
  mood: number | null;
  source: 'tap' | 'voice' | 'wearable';
}

export interface CheckinState {
  time: CheckinTime;
  today: string;
  // The person's local hour now.
  hour: number;
  checkin: Checkin | null;
  skipped_today: boolean;
  ask_to_turn_off: boolean;
}

export interface CheckinAnswer {
  energy?: number;
  sleep?: number;
  mood?: number;
}

export const EVENING_FROM_HOUR = 17;
export const SLEEP_DEFAULT = 7;
export const SLEEP_STEP = 0.5;
export const SLEEP_MAX = 16;

// Shown once a day at most: not after it's done or skipped, and never when it's off.
export function showCheckin(state: CheckinState | null): boolean {
  if (!state || state.time === 'off' || state.skipped_today) return false;
  if (state.checkin && state.checkin.energy !== null && state.checkin.mood !== null) return false;
  return state.time === 'morning' || state.hour >= EVENING_FROM_HOUR;
}

export const SCALE_WORDS = ['Very low', 'Low', 'Okay', 'Good', 'Great'];

// ---------------------------------------------------------------------------
// By voice: "slept 6 hours, energy low"
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5,
  chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10,
}; // prettier-ignore

// Low, okay and high are 2, 3 and 4, leaving 1 and 5 for the strong words.
const LEVEL_WORDS: [RegExp, number][] = [
  [/\b(very low|terrible|awful|exhausted|drained)\b/, 1],
  [/\b(very high|great|excellent|amazing|fantastic)\b/, 5],
  [/\b(low|tired|sleepy|bad|down|not great|kam)\b/, 2],
  [/\b(high|good|energetic|happy|accha|achha)\b/, 4],
  [/\b(okay|ok|fine|medium|average|so so|theek|thik)\b/, 3],
];

const toNumber = (word: string) => (word in NUMBER_WORDS ? NUMBER_WORDS[word] : Number(word));
const NUMBER = String.raw`(\d+(?:\.\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`;

function levelAfter(text: string, keyword: RegExp): number | undefined {
  const match = keyword.exec(text);
  if (!match) return undefined;
  // What's said right after the word: "energy low", "mood is 4", "energy 3 out of 5".
  const rest = text.slice(match.index + match[0].length, match.index + match[0].length + 24);
  const digit = new RegExp(String.raw`^\s*(?:is|was|of|at|:)?\s*${NUMBER}\b`).exec(rest);
  if (digit) {
    const value = toNumber(digit[1]);
    return value >= 1 && value <= 5 ? Math.round(value) : undefined;
  }
  // Or right before it: "low energy", "good mood".
  const before = text.slice(Math.max(0, match.index - 14), match.index);
  for (const [pattern, value] of LEVEL_WORDS) {
    if (pattern.test(rest.split(/[,.;]| and /)[0]) || pattern.test(before)) return value;
  }
  return undefined;
}

function sleepIn(text: string): number | undefined {
  const patterns = [
    new RegExp(String.raw`\b(?:slept|sleep|soya|soyi|neend)\b\D{0,12}?${NUMBER}\s*(?:hours?|hrs?|h|ghante)?`),
    new RegExp(String.raw`${NUMBER}\s*(?:hours?|hrs?|h|ghante)\s*(?:of\s+)?(?:sleep|slept|soya|soyi|neend)`),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const hours = toNumber(match[1]);
      if (hours >= 0 && hours <= SLEEP_MAX) return Math.round(hours / SLEEP_STEP) * SLEEP_STEP;
    }
  }
  return undefined;
}

// What a phrase says about today's check-in, or null if it isn't one.
export function parseCheckinPhrase(text: string): CheckinAnswer | null {
  const said = text.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  const answer: CheckinAnswer = {};
  const sleep = sleepIn(said);
  if (sleep !== undefined) answer.sleep = sleep;
  const energy = levelAfter(said, /\benergy\b/);
  if (energy !== undefined) answer.energy = energy;
  const mood = levelAfter(said, /\bmood\b/);
  if (mood !== undefined) answer.mood = mood;
  if (answer.energy === undefined && /\b(feeling|feel|i am|im)\s+(tired|exhausted|drained|sleepy)\b/.test(said)) {
    answer.energy = /exhausted|drained/.test(said) ? 1 : 2;
  }
  return Object.keys(answer).length > 0 ? answer : null;
}

// Only energy and mood words always mean a check-in. Sleep alone might be a habit called
// Sleep, so it's a check-in only when no habit matched.
export const mentionsEnergyOrMood = (text: string) => /\b(energy|mood)\b/i.test(text);

const hours = (value: number) => `${value} ${value === 1 ? 'hour' : 'hours'}`;

// What's said back.
export function checkinReply(answer: CheckinAnswer): string {
  const parts = [];
  if (answer.sleep !== undefined) parts.push(`${hours(answer.sleep)} of sleep`);
  if (answer.energy !== undefined) parts.push(`energy ${SCALE_WORDS[answer.energy - 1].toLowerCase()}`);
  if (answer.mood !== undefined) parts.push(`mood ${SCALE_WORDS[answer.mood - 1].toLowerCase()}`);
  return `Check-in saved: ${parts.join(', ')}.`;
}
