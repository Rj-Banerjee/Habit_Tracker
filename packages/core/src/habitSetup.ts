import type { HabitFrequency, HabitType, TimeOfDay } from './api';
import { LibraryHabit, matchLibrary } from './habitLibrary';
import {
  convertAmount,
  DAILY_CAPS,
  FAST_HOURS_CAP,
  findUnit,
  isFast,
  isRestDuration,
  SLEEP_HOURS_CAP,
  UNIT_WORDS,
  unitName,
} from './units';

// Everything the habit form suggests for a name. The library, simple parsing and, on
// Pro, the AI all produce one of these, so the screen never cares where it came from.
export interface HabitSetup {
  title: string;
  type: HabitType;
  target: number | null;
  unit: string | null;
  frequency: HabitFrequency;
  perWeek: number | null;
  // Why those days, in one line.
  reason: string | null;
  timeOfDay: TimeOfDay;
  minimumText: string;
  minimumTarget: number | null;
  setup: string;
  identity: string;
  voiceAliases: string[];
  reminderTime: string | null;
  // Offered for time-limited goals, never switched on.
  suggestedEndDays: number | null;
  // Said calmly when a suggestion was made gentler.
  note: string | null;
  source: 'library' | 'ai' | 'parsed';
}

export const FALLBACK_IDENTITY = 'Everyday';

export const DEFAULT_REMINDERS: Record<TimeOfDay, string | null> = {
  morning: '08:00',
  afternoon: '13:00',
  evening: '19:00',
  anytime: null,
};

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
};
export const TIMES_OF_DAY: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  hundred: 100, half: 0.5, ek: 1, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, das: 10,
  bees: 20, pachas: 50,
}; // prettier-ignore

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UNIT_PATTERN = UNIT_WORDS.map(escape).join('|');
const NUMBER = `(\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`;
// "2-3 pages", "2 to 3 pages": a range uses the lower number.
const RANGE = `${NUMBER}(?:\\s*(?:-|–|to|se)\\s*${NUMBER})?`;
const AMOUNT = new RegExp(`(?:^|\\s)${RANGE}\\s*(${UNIT_PATTERN})?(?=$|[\\s,.!?])`, 'i');

const toNumber = (text: string) => {
  const lower = text.toLowerCase();
  return lower in NUMBER_WORDS ? NUMBER_WORDS[lower] : Number(lower.replace(',', '.'));
};

export interface ParsedAmount {
  amount: number;
  unit: string | null;
  // Where it was in the text, so it can be cut out.
  start: number;
  end: number;
}

// "10,000 steps" is ten thousand, and "10k steps" is too.
export const tidyNumbers = (text: string) =>
  text
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/(\d+(?:\.\d+)?)k(?=\s+(?:steps|words|kadam)\b)/gi, (_, n) => String(Number(n) * 1000));

// The first amount in some text, with its unit if one follows. Ranges use the lower
// number. Positions are in the text after tidyNumbers.
export function parseAmount(text: string): ParsedAmount | null {
  const match = AMOUNT.exec(tidyNumbers(text));
  if (!match) return null;
  const amount = toNumber(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[3] ? unitName(match[3]) : null;
  // A number word with no unit ("one thing") isn't an amount.
  if (!unit && !/\d/.test(match[1])) return null;
  const start = match.index + (match[0].length - match[0].trimStart().length);
  return { amount, unit, start, end: match.index + match[0].length };
}

const TRAILING = /\s*\b(daily|every\s*day|everyday|each\s*day|a\s*day|per\s*day|roz(ana)?|har\s*din|a\s*week|per\s*week|weekly)\b\.?\s*$/i;

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

// "Run 20 km" is Run with a target of 20 km; "Read 10 pages daily" is Read, 10 pages.
export function parseHabitName(text: string): { title: string; target: number | null; unit: string | null } {
  let title = tidyNumbers(text.trim());
  while (TRAILING.test(title)) title = title.replace(TRAILING, '');
  const known = parseAmount(title);
  const found = known?.unit ? known : (customAmount(title) ?? known);
  if (!found || !found.unit) return { title: capitalise(title), target: null, unit: null };
  const cut = `${title.slice(0, found.start)} ${title.slice(found.end)}`
    .replace(/\s+(of|for)\s+/i, ' ')
    .replace(TRAILING, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "30 push-ups a day" is all amount: the unit names the habit.
  return { title: capitalise(cut || found.unit), target: found.amount, unit: found.unit };
}

// In a name, any word after a number can be its unit: "Swim 20 laps".
const NOT_UNITS = new Set(['times', 'time', 'a', 'an', 'per', 'day', 'days', 'week', 'weeks', 'x']);
function customAmount(title: string): ParsedAmount | null {
  const match = /(?:^|\s)(\d+(?:\.\d+)?)\s+([a-z][a-z-]{1,29})\b/i.exec(title);
  if (!match || NOT_UNITS.has(match[2].toLowerCase())) return null;
  const start = match.index + (match[0].length - match[0].trimStart().length);
  return { amount: Number(match[1]), unit: match[2].toLowerCase(), start, end: match.index + match[0].length };
}

const typeForUnit = (unit: string | null): HabitType =>
  !unit ? 'boolean' : findUnit(unit)?.family === 'time' ? 'duration' : 'count';

export interface DecodedMinimum {
  description: string;
  target: number | null;
  // The unit it was said in couldn't be compared with the habit's.
  otherUnit: string | null;
}

// "read at least 2 pages" is 2 pages; "atleast 10 min" is 10 min; "just put on shoes"
// is a description only. A minimum in another unit of the same kind is converted.
export function decodeMinimum(text: string, habitUnit: string | null): DecodedMinimum {
  const description = text.trim();
  const found = parseAmount(description.replace(/\batleast\b/gi, 'at least'));
  if (!found) return { description, target: null, otherUnit: null };
  if (!habitUnit) {
    return { description, target: found.unit ? null : found.amount, otherUnit: found.unit };
  }
  const converted = convertAmount(found.amount, found.unit, habitUnit);
  if (converted === null) return { description, target: null, otherUnit: found.unit };
  return { description, target: converted, otherUnit: null };
}

// ---------------------------------------------------------------------------
// Safe suggestions
// ---------------------------------------------------------------------------

const INTENSE = /\b(run|running|jog|workout|work out|gym|hiit|strength|weights|lift|cycle|cycling|swim|marathon|pull-?ups|crossfit|kasrat|daud)/i;

const gentleTarget = (unit: string, cap: number) => {
  if (unit === 'km') return 5;
  if (unit === 'miles') return 3;
  return Math.max(1, Math.round(cap / 4));
};

// A suggestion is never extreme. Over a cap, it starts gentler and says so calmly.
// This only shapes suggestions: what someone types themselves is theirs.
export function safetyCheck(setup: HabitSetup): HabitSetup {
  let { target, minimumTarget, frequency, perWeek, reason, note } = setup;
  const unit = setup.unit;
  if (target !== null && unit) {
    if (isRestDuration(setup.title) && findUnit(unit)?.family === 'time') {
      const hours = convertAmount(target, unit, 'hours') ?? 0;
      if (isFast(setup.title) && hours > FAST_HOURS_CAP) {
        target = convertAmount(12, 'hours', unit);
        note = 'Long fasts are best built up to. Starting at 12 hours is gentler, and worth checking with a doctor first.';
      } else if (!isFast(setup.title) && hours > SLEEP_HOURS_CAP) {
        target = convertAmount(8, 'hours', unit);
      }
    } else {
      const cap = DAILY_CAPS[unitName(unit)];
      if (cap !== undefined && target > cap) {
        target = gentleTarget(unitName(unit), cap);
        note = `Starting at ${target} ${unit} a day is easier on your body. You can raise it any time.`;
      }
    }
  }
  if (target !== null && minimumTarget !== null && minimumTarget >= target) {
    minimumTarget = Math.max(1, Math.round(target / 5));
  }
  const intense = INTENSE.test(setup.title);
  if (intense && (frequency === 'days' || (perWeek ?? 0) > 5)) {
    frequency = 'per_week';
    perWeek = 4;
    reason = 'Rest days help your body recover.';
  }
  return { ...setup, target, minimumTarget, frequency, perWeek, reason, note };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const challengeDays = (text: string) => {
  const match = /(\d+)\s*-?\s*day\s+challenge/i.exec(text);
  return match ? Number(match[1]) : null;
};

function fromLibrary(habit: LibraryHabit, parsed: ReturnType<typeof parseHabitName>, typed: string): HabitSetup {
  let target = habit.target;
  let unit = habit.unit;
  let minimumTarget = habit.minimum.target;
  let minimumText = habit.minimum.description;
  if (parsed.target !== null) {
    // Their own amount wins. In the library's unit if it converts, so the minimum still fits.
    const same = unit ? convertAmount(parsed.target, parsed.unit, unit) : null;
    if (same !== null) {
      target = same;
    } else {
      target = parsed.target;
      unit = parsed.unit;
      minimumTarget = Math.max(1, Math.round(parsed.target / 5));
      minimumText = `At least ${minimumTarget} ${unit}`;
    }
  }
  const type = target !== null && habit.type === 'boolean' ? typeForUnit(unit) : habit.type;
  return {
    title: parsed.title || habit.name,
    type,
    target: type === 'boolean' || type === 'quit' ? null : target,
    unit: type === 'boolean' || type === 'quit' ? null : unit,
    frequency: habit.frequency,
    perWeek: habit.perWeek,
    reason: habit.reason,
    timeOfDay: habit.timeOfDay,
    minimumText,
    minimumTarget: type === 'boolean' || type === 'quit' ? null : minimumTarget,
    setup: habit.setup,
    identity: habit.identity,
    voiceAliases: habit.voiceAliases,
    reminderTime: DEFAULT_REMINDERS[habit.timeOfDay],
    suggestedEndDays: challengeDays(typed) ?? habit.endsAfterDays ?? null,
    note: null,
    source: 'library',
  };
}

// For a name the library doesn't know, with nothing but the name to go on.
function fromParsing(parsed: ReturnType<typeof parseHabitName>, typed: string): HabitSetup {
  const type = typeForUnit(parsed.unit);
  const minimumTarget = parsed.target !== null ? Math.max(1, Math.round(parsed.target / 5)) : null;
  const words = parsed.title.toLowerCase();
  return {
    title: parsed.title,
    type,
    target: parsed.target,
    unit: parsed.unit,
    frequency: 'days',
    perWeek: null,
    reason: null,
    timeOfDay: 'anytime',
    minimumText:
      minimumTarget !== null ? `At least ${minimumTarget} ${parsed.unit}` : words ? `${parsed.title} for 2 minutes` : '',
    minimumTarget,
    setup: '',
    identity: FALLBACK_IDENTITY,
    voiceAliases: [],
    reminderTime: null,
    suggestedEndDays: challengeDays(typed),
    note: null,
    source: 'parsed',
  };
}

// "Evening run" is in the evening, whatever the library says about runs.
const NAMED_TIMES: [RegExp, TimeOfDay][] = [
  [/\b(morning|subah|sunrise|wake)\b/i, 'morning'],
  [/\b(afternoon|lunch|dopahar|noon)\b/i, 'afternoon'],
  [/\b(evening|night|bedtime|shaam|sham|raat|dinner)\b/i, 'evening'],
];
const namedTime = (name: string) => NAMED_TIMES.find(([words]) => words.test(name))?.[1] ?? null;

// What the form suggests for a name, from the library and simple parsing. Free uses only
// this; Pro starts here and asks the AI only when the library doesn't know the name.
export function suggestSetup(name: string): { setup: HabitSetup; known: boolean } {
  const parsed = parseHabitName(name);
  const habit = matchLibrary(name);
  const found = habit ? fromLibrary(habit, parsed, name) : fromParsing(parsed, name);
  const timeOfDay = namedTime(name) ?? found.timeOfDay;
  const setup = { ...found, timeOfDay, reminderTime: DEFAULT_REMINDERS[timeOfDay] };
  return { setup: safetyCheck(setup), known: habit !== null };
}

// For habits made before time of day and structured minimums: what they should get.
// Past logs are never touched; only the habit's settings are filled in.
export function backfillHabit(habit: {
  title: string;
  type: HabitType;
  unit: string | null;
  minimum: string | null;
}): { timeOfDay: TimeOfDay; minimumTarget: number | null; known: boolean } {
  const { setup, known } = suggestSetup(habit.title);
  const amounts = habit.type === 'count' || habit.type === 'duration';
  const minimum = amounts && habit.minimum ? decodeMinimum(habit.minimum, habit.unit) : null;
  return { timeOfDay: known || namedTime(habit.title) ? setup.timeOfDay : 'anytime', minimumTarget: minimum?.target ?? null, known };
}

const TYPES: HabitType[] = ['boolean', 'count', 'duration', 'quit'];
const isTimeOfDay = (value: unknown): value is TimeOfDay => TIMES_OF_DAY.includes(value as TimeOfDay);
const positive = (value: unknown) => (typeof value === 'number' && value > 0 && Number.isFinite(value) ? value : null);
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// The AI's suggestion, checked field by field. Anything that doesn't hold up keeps the
// library or parsing value, and the result goes through the same safety check.
export function fromAiSuggestion(raw: Record<string, unknown>, fallback: HabitSetup): HabitSetup {
  const type = TYPES.includes(raw.type as HabitType) ? (raw.type as HabitType) : fallback.type;
  const amounts = type === 'count' || type === 'duration';
  const perWeek = positive(raw.per_week);
  const weekly = raw.frequency === 'per_week' && perWeek !== null && perWeek >= 1 && perWeek <= 6;
  const timeOfDay = isTimeOfDay(raw.time_of_day) ? raw.time_of_day : fallback.timeOfDay;
  const unit = amounts ? text(raw.unit, 30) || fallback.unit : null;
  return safetyCheck({
    ...fallback,
    type,
    target: amounts ? (positive(raw.target) ?? fallback.target) : null,
    unit: unit ? unitName(unit) : null,
    frequency: weekly ? 'per_week' : 'days',
    perWeek: weekly ? Math.round(perWeek) : null,
    reason: text(raw.reason, 120) || fallback.reason,
    timeOfDay,
    minimumText: text(raw.minimum_text, 200) || fallback.minimumText,
    minimumTarget: amounts ? (positive(raw.minimum_target) ?? fallback.minimumTarget) : null,
    setup: text(raw.setup, 200) || fallback.setup,
    identity: text(raw.identity, 80) || fallback.identity,
    voiceAliases: Array.isArray(raw.voice_aliases)
      ? raw.voice_aliases.map((alias) => text(alias, 40)).filter(Boolean).slice(0, 5)
      : fallback.voiceAliases,
    reminderTime: DEFAULT_REMINDERS[timeOfDay],
    suggestedEndDays: positive(raw.suggested_end_days) ?? fallback.suggestedEndDays,
    note: text(raw.note, 200) || fallback.note,
    source: 'ai',
  });
}

// ---------------------------------------------------------------------------
// Ending a habit
// ---------------------------------------------------------------------------

// The last day of a habit that runs N calendar days from its start: day 1 is the start.
export function endsAfterDays(startDate: string, days: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(1, Math.round(days)) - 1);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The review card
// ---------------------------------------------------------------------------

export type ReviewLine = 'type' | 'identity' | 'reminder' | 'setup' | 'voice';

const TYPE_WORDS: Record<HabitType, string> = {
  boolean: 'Yes or no',
  count: 'Count',
  duration: 'Duration',
  quit: 'Quit',
};

const clock = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export interface ReviewValues {
  type: HabitType;
  unit: string | null;
  identity: string;
  reminderTime: string | null;
  setup: string;
  voiceAliases: string[];
}

// "We set these up for you": one short line each, to accept or tap and change.
export function reviewLines(values: ReviewValues): { line: ReviewLine; label: string; value: string }[] {
  return [
    {
      line: 'type',
      label: 'Type',
      value: values.unit ? `${TYPE_WORDS[values.type]}, in ${values.unit}` : TYPE_WORDS[values.type],
    },
    { line: 'identity', label: 'Identity', value: values.identity || FALLBACK_IDENTITY },
    { line: 'reminder', label: 'Reminder', value: values.reminderTime ? clock(values.reminderTime) : 'None' },
    { line: 'setup', label: 'Just set up', value: values.setup || 'None' },
    { line: 'voice', label: 'Voice names', value: values.voiceAliases.length ? values.voiceAliases.join(', ') : 'None' },
  ];
}
