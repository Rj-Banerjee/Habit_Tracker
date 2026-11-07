import type { HabitFrequency, HabitType, TimeOfDay } from './api';
import library from './habitLibrary.json';
import { UNIT_WORDS } from './units';

// Common habits, as data, built by scripts/build-habit-library.py. Free sets up habits
// from this alone; Pro uses it first and asks the model only about names it doesn't know.

export interface LibraryHabit {
  id: string;
  name: string;
  synonyms: string[];
  type: HabitType;
  target: number | null;
  unit: string | null;
  minimum: { description: string; target: number | null };
  setup: string;
  frequency: HabitFrequency;
  perWeek: number | null;
  // One line on why these days, shown under the days control.
  reason: string;
  timeOfDay: TimeOfDay;
  identity: string;
  voiceAliases: string[];
  // For clearly time-limited goals: offered as an end, never switched on.
  endsAfterDays?: number;
}

export const HABIT_LIBRARY = library.habits as LibraryHabit[];

// Words that say how often or how much, not what. "Read daily" is Read.
const FILLER = new Set(
  `daily everyday every day days each a per roz rozana har din i i'll ill want to will should
  start more my the an at least for of in on go do get karna karo hai hain ko ka ki ke
  please habit new try week weekly twice once`.split(/\s+/)
);

const UNIT_SET = new Set(UNIT_WORDS);

export const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// What's left of a name once amounts, units and filler are gone: "Run 20 km daily" is "run".
export function coreWords(text: string): string[] {
  const words = normalise(text.replace(/(\d)(?=[a-z])/gi, '$1 ')).split(' ').filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (/^\d+([.,]\d+)?$/.test(word)) {
      // A number takes its unit with it, including two-word units such as "push ups".
      const pair = `${words[i + 1]} ${words[i + 2]}`;
      if (UNIT_SET.has(pair)) i += 2;
      else if (UNIT_SET.has(words[i + 1] ?? '')) i += 1;
      continue;
    }
    if (FILLER.has(word)) continue;
    kept.push(word);
  }
  return kept;
}

interface Key {
  words: string[];
  habit: LibraryHabit;
}

const KEYS: Key[] = HABIT_LIBRARY.flatMap((habit) =>
  [habit.name, ...habit.synonyms].map((text) => ({ words: coreWords(text), habit }))
).filter((key) => key.words.length > 0);

const containsRun = (words: string[], key: string[]) => {
  for (let i = 0; i + key.length <= words.length; i++) {
    if (key.every((word, at) => words[i + at] === word)) return true;
  }
  return false;
};

// The library habit a name means, or null. Exact names and synonyms first, then the
// longest synonym found inside the name, so "go for a morning walk" is Walk.
export function matchLibrary(name: string): LibraryHabit | null {
  let words = coreWords(name);
  // "30 push-ups a day" is all amount: the unit is the habit.
  if (words.length === 0) {
    words = normalise(name)
      .split(' ')
      .filter((word) => word && !/^\d/.test(word) && !FILLER.has(word));
  }
  if (words.length === 0) return null;
  const joined = words.join(' ');
  const exact = KEYS.find((key) => key.words.join(' ') === joined);
  if (exact) return exact.habit;

  let best: Key | null = null;
  for (const key of KEYS) {
    if (!containsRun(words, key.words)) continue;
    if (!best || key.words.join(' ').length > best.words.join(' ').length) best = key;
  }
  return best?.habit ?? null;
}

// Live suggestions while typing: habits whose name or a synonym starts with what's been
// typed so far, best first. Nothing for fewer than 2 letters.
export function suggestNames(text: string, limit = 4): LibraryHabit[] {
  const typed = normalise(text);
  if (typed.length < 2) return [];
  const scored = new Map<LibraryHabit, number>();
  for (const habit of HABIT_LIBRARY) {
    const names = [habit.name, ...habit.synonyms].map(normalise);
    let score = 0;
    if (names[0].startsWith(typed)) score = 3;
    else if (names.some((n) => n.startsWith(typed))) score = 2;
    else if (names.some((n) => n.split(' ').some((word) => word.startsWith(typed)))) score = 1;
    if (score > 0) scored.set(habit, score);
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].name.length - b[0].name.length)
    .slice(0, limit)
    .map(([habit]) => habit);
}
