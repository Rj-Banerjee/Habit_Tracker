// Units a habit can be measured in. Units in the same family convert; any other pair
// doesn't, so "2 lines" never counts toward a pages habit.

export type UnitFamily = 'distance' | 'time' | 'volume' | 'count';

interface UnitInfo {
  // The name stored on a habit.
  name: string;
  family: UnitFamily;
  // How many of the family's base unit one of these is (metres, minutes, millilitres).
  // Count units have no base: they only match themselves.
  scale: number;
  // What people type or say for it, lower case.
  says: string[];
}

export const UNITS: UnitInfo[] = [
  { name: 'km', family: 'distance', scale: 1000, says: ['km', 'kms', 'kilometre', 'kilometres', 'kilometer', 'kilometers', 'k'] },
  { name: 'm', family: 'distance', scale: 1, says: ['m', 'metre', 'metres', 'meter', 'meters', 'mtr', 'mtrs'] },
  { name: 'miles', family: 'distance', scale: 1609.344, says: ['mile', 'miles', 'mi'] },
  { name: 'min', family: 'time', scale: 1, says: ['min', 'mins', 'minute', 'minutes', 'minat', 'minute ka'] },
  { name: 'hours', family: 'time', scale: 60, says: ['hour', 'hours', 'hr', 'hrs', 'h', 'ghanta', 'ghante'] },
  { name: 'sec', family: 'time', scale: 1 / 60, says: ['sec', 'secs', 'second', 'seconds', 's'] },
  { name: 'ml', family: 'volume', scale: 1, says: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'] },
  { name: 'litres', family: 'volume', scale: 1000, says: ['l', 'litre', 'litres', 'liter', 'liters', 'ltr', 'ltrs'] },
  { name: 'glasses', family: 'count', scale: 1, says: ['glass', 'glasses', 'glas', 'gilass'] },
  { name: 'pages', family: 'count', scale: 1, says: ['page', 'pages', 'pg', 'pgs', 'panne', 'panna'] },
  { name: 'steps', family: 'count', scale: 1, says: ['step', 'steps', 'kadam'] },
  { name: 'reps', family: 'count', scale: 1, says: ['rep', 'reps', 'repetition', 'repetitions', 'times'] },
  { name: 'push-ups', family: 'count', scale: 1, says: ['push-up', 'push-ups', 'pushup', 'pushups', 'push up', 'push ups'] },
  { name: 'squats', family: 'count', scale: 1, says: ['squat', 'squats'] },
  { name: 'words', family: 'count', scale: 1, says: ['word', 'words', 'shabd'] },
  { name: 'lines', family: 'count', scale: 1, says: ['line', 'lines'] },
  { name: 'chapters', family: 'count', scale: 1, says: ['chapter', 'chapters'] },
  { name: 'problems', family: 'count', scale: 1, says: ['problem', 'problems', 'question', 'questions', 'sawal'] },
  { name: 'flashcards', family: 'count', scale: 1, says: ['flashcard', 'flashcards', 'card', 'cards'] },
  { name: 'lessons', family: 'count', scale: 1, says: ['lesson', 'lessons'] },
  { name: 'servings', family: 'count', scale: 1, says: ['serving', 'servings', 'portion', 'portions'] },
  { name: 'fruits', family: 'count', scale: 1, says: ['fruit', 'fruits', 'phal'] },
  { name: 'rounds', family: 'count', scale: 1, says: ['round', 'rounds', 'mala'] },
  { name: 'items', family: 'count', scale: 1, says: ['item', 'items', 'things', 'cheezein'] },
  { name: 'tasks', family: 'count', scale: 1, says: ['task', 'tasks'] },
  { name: 'emails', family: 'count', scale: 1, says: ['email', 'emails', 'mail', 'mails'] },
  { name: 'calls', family: 'count', scale: 1, says: ['call', 'calls'] },
  { name: 'pomodoros', family: 'count', scale: 1, says: ['pomodoro', 'pomodoros'] },
  { name: 'sun salutations', family: 'count', scale: 1, says: ['sun salutation', 'sun salutations', 'surya namaskar', 'surya namaskars'] },
  { name: 'cigarettes', family: 'count', scale: 1, says: ['cigarette', 'cigarettes', 'cig', 'cigs'] },
  { name: 'cups', family: 'count', scale: 1, says: ['cup', 'cups'] },
];

const byWord = new Map<string, UnitInfo>();
for (const unit of UNITS) {
  byWord.set(unit.name, unit);
  for (const word of unit.says) byWord.set(word, unit);
}

// The longest spellings first, so "push ups" wins over "push".
export const UNIT_WORDS = [...byWord.keys()].sort((a, b) => b.length - a.length);

export const findUnit = (text: string | null | undefined): UnitInfo | null =>
  text ? (byWord.get(text.trim().toLowerCase()) ?? null) : null;

// The habit's own spelling for a unit someone typed, or the text itself when it's not one
// we know, tidied.
export const unitName = (text: string) => findUnit(text)?.name ?? text.trim().toLowerCase();

const round = (value: number) => Math.round(value * 1000) / 1000;

// An amount in one unit, in another. Null when the two can't be compared.
export function convertAmount(amount: number, from: string | null, to: string | null): number | null {
  // No unit said, or none on the habit: the amount is taken as the habit's own.
  if (!from || !to) return amount;
  const a = findUnit(from);
  const b = findUnit(to);
  if (!a || !b) return from.trim().toLowerCase() === to.trim().toLowerCase() ? amount : null;
  if (a.name === b.name) return amount;
  if (a.family !== b.family || a.family === 'count') return null;
  return round((amount * a.scale) / b.scale);
}

// The most a suggestion may set for a day, in the unit's own terms. Above this, a gentler
// start is suggested with a calm note. People can still type more themselves.
export const DAILY_CAPS: Record<string, number> = {
  km: 21,
  m: 21000,
  miles: 13,
  min: 180,
  hours: 3,
  sec: 10800,
  ml: 4000,
  litres: 4,
  glasses: 16,
  pages: 100,
  steps: 25000,
  reps: 300,
  'push-ups': 200,
  squats: 200,
  words: 5000,
  chapters: 10,
  problems: 50,
  flashcards: 300,
  lessons: 10,
  'sun salutations': 108,
  pomodoros: 12,
};

// Sleep and fasting are hours of rest, not activity, so the hours cap doesn't apply.
// A fast has its own: longer ones are risky to start with.
export const isRestDuration = (name: string) => /sleep|fast|neend|vrat|upva/i.test(name);
export const isFast = (name: string) => /fast|vrat|upva/i.test(name);
export const FAST_HOURS_CAP = 16;
export const SLEEP_HOURS_CAP = 10;
