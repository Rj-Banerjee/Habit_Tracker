// Habit connections (Pro): links measured between habits, explained, with one-tap fixes.
// See "Habit connections" in PLAN.md. The numbers and the wording come from the server;
// this is what the app says around them.

export type ConnectionAction =
  | { type: 'move_time'; time_of_day: string }
  | { type: 'move_first' }
  | { type: 'light_day'; weekday: number }
  | { type: 'rest_day'; weekday: number }
  | { type: 'minimum_after'; after_habit_id: string }
  | { type: 'switch_per_week'; per_week: number }
  | { type: 'change_target'; target: number }
  | { type: 'add_reminder'; reminder_time: string }
  | { type: 'light_today'; date?: string };

export interface ConnectionFix {
  label: string;
  habit_id: string;
  action: ConnectionAction;
}

export type ConnectionSubject = { type: 'habit'; id: string; title: string } | { type: 'signal'; name: string };

export type FindingAnswer = 'yes' | 'no' | 'not_sure';

export interface Connection {
  id: string;
  kind: string;
  key: string;
  subjects: ConnectionSubject[];
  direction: 'helps' | 'competes';
  effect: number;
  sample: number;
  confidence: 'high' | 'medium';
  range_from: string;
  range_to: string;
  numbers: Record<string, unknown>;
  explanation: string | null;
  question: string | null;
  fixes: ConnectionFix[];
  answer: FindingAnswer | null;
}

export interface HeadsUp {
  finding_id: string;
  key: string;
  kind: string;
  a_id: string;
  a_title: string;
  b_id: string;
  b_title: string;
  numbers: Record<string, unknown>;
}

export interface Warning {
  kind: 'overload' | 'dragging' | 'declining';
  habit?: string;
  slipping: (string | { title: string; before: number; after: number })[];
}

export interface AiChange {
  id: string;
  habit_id: string | null;
  habit_title: string | null;
  source: 'insight' | 'connection' | 'heads_up' | 'autopilot';
  action: ConnectionAction;
  actor: 'ai_assisted' | 'ai';
  reason: string | null;
  applied_at: string;
  undone_at: string | null;
  seen_at: string | null;
}

export const ANSWER_LABELS: Record<FindingAnswer, string> = { yes: 'Yes', no: 'No', not_sure: 'Not sure' };

// What's said after an answer: "No" hides it for 60 days, "Yes" puts it first.
export const ANSWER_REPLIES: Record<FindingAnswer, string> = {
  yes: "Thanks. This one will come first, and fixes for it are worth a try.",
  no: "Thanks. It won't come up again for 60 days.",
  not_sure: 'Fair enough. It stays here while the numbers settle.',
};

export const isHabit = (subject: ConnectionSubject): subject is Extract<ConnectionSubject, { type: 'habit' }> =>
  subject.type === 'habit';

const SIGNAL_NAMES: Record<string, string> = { sleep: 'Sleep', energy: 'Energy', mood: 'Mood' };

export const subjectName = (subject: ConnectionSubject) =>
  isHabit(subject) ? subject.title : (SIGNAL_NAMES[subject.name] ?? subject.name);

// The morning heads-up: today's plan matches a link that competes the day after.
export function headsUpText(headsUp: HeadsUp): string {
  const n = headsUp.numbers as Record<string, number | string>;
  const after = n.after_big ?? n.after;
  const otherwise = n.otherwise;
  const numbers = after !== undefined && otherwise !== undefined ? ` (${after}% against ${otherwise}%)` : '';
  const what = headsUp.kind === 'after_big_amount' ? `a big ${headsUp.a_title}` : headsUp.a_title;
  return `Heads-up: after ${what} yesterday, ${headsUp.b_title} often slips${numbers}. Make today's ${headsUp.b_title} just the minimum?`;
}

export const HEADS_UP_FIX = (headsUp: HeadsUp) => `Minimum ${headsUp.b_title} today`;

// Firm but kind, never shaming.
export function warningText(warning: Warning): string {
  const names = warning.slipping.map((item) => (typeof item === 'string' ? item : item.title));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
  if (warning.kind === 'overload') {
    return `Since ${warning.habit} started, ${list} have both slipped for two weeks. That's a sign of too much at once, not of you. Pausing or shrinking ${warning.habit} for a while is a fine choice.`;
  }
  if (warning.kind === 'dragging') {
    return `${warning.habit} seems linked to ${list} slipping. Worth a look: a smaller ${warning.habit}, or a rest day after it, could free up room.`;
  }
  return `${list} have been easing off for a couple of weeks. It happens. Using the minimum for a while keeps them going.`;
}

// For the Habit map: the habits around a circle, and how thick a link is.
export interface MapNode {
  id: string;
  title: string;
  x: number;
  y: number;
}

export function mapLayout(ids: { id: string; title: string }[], size: number, padding: number): MapNode[] {
  const centre = size / 2;
  const radius = Math.max(0, centre - padding);
  if (ids.length === 1) return [{ ...ids[0], x: centre, y: centre }];
  return ids.map((node, i) => {
    // Starting at the top, going clockwise.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
    return { ...node, x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle) };
  });
}

// From 2 to 8 points: stronger links are thicker.
export const linkWidth = (effect: number) => 2 + Math.round(Math.min(1, Math.abs(effect) / 0.6) * 6);

// The habits a connection joins, for the map (signals have no node).
export function mapLinks(connections: Connection[]) {
  return connections
    .filter((c) => c.subjects.filter(isHabit).length === 2 && c.kind !== 'overload')
    .map((c) => {
      const [a, b] = c.subjects.filter(isHabit);
      return { connection: c, from: a.id, to: b.id };
    });
}

export function mapHabits(connections: Connection[]) {
  const seen = new Map<string, string>();
  for (const c of connections) for (const s of c.subjects.filter(isHabit)) seen.set(s.id, s.title);
  return [...seen].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
}

export const AUTOPILOT_HINT =
  'When on, the AI may make small changes by itself: the order of habits, their part of the day, or the minimum for one day. You get a notice each time, with Undo. Targets, limits and ending a habit always wait for you.';

// The Habit map's two link colours: a calm green for links that help, amber for ones that
// compete. Never red. Shape says it too: competing links are dashed.
export const LINK_COLORS: Record<'light' | 'dark', { helps: string; competes: string }> = {
  light: { helps: '#2F7D5B', competes: '#A8650A' },
  dark: { helps: '#6CC49B', competes: '#E2A54A' },
};
