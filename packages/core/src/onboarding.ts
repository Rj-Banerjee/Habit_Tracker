import { emptyHabitForm, HabitFormValues, validateHabitForm } from './habitForm';
import { decodeMinimum, parseHabitName, suggestSetup } from './habitSetup';

// Shown as examples on the first screen. Each is in the habit library.
export const EXAMPLE_HABITS = ['Read', 'Go for a run', 'Meditate', 'Drink water', 'Study'];

export interface OnboardingHabit {
  title: string;
  minimum: string;
}

export const blankOnboardingHabit = (): OnboardingHabit => ({ title: '', minimum: '' });

// A first habit, set up like the habit form does it: from the library, or from the name.
// The minimum they typed wins; left blank, the suggested one is used.
export function onboardingHabitSetup(habit: OnboardingHabit): { values: HabitFormValues; identity: string } {
  const { setup } = suggestSetup(habit.title);
  const parsed = parseHabitName(habit.title);
  const minimumText = habit.minimum.trim() || setup.minimumText;
  const minimum = decodeMinimum(minimumText, setup.unit);
  return {
    identity: setup.identity,
    values: {
      ...emptyHabitForm(null),
      title: parsed.target !== null ? parsed.title : habit.title.trim(),
      type: setup.type,
      target: setup.target !== null ? String(setup.target) : '',
      unit: setup.unit ?? '',
      frequency: setup.frequency,
      perWeek: setup.perWeek ?? 3,
      timeOfDay: setup.timeOfDay,
      reminderTime: setup.reminderTime,
      minimumDescription: minimumText,
      minimumTarget: minimum.target !== null ? String(minimum.target) : '',
      setupDescription: setup.setup,
      voiceAliases: setup.voiceAliases.join(', '),
    },
  };
}

// The suggested minimum, shown as the placeholder until they write their own.
export const suggestedMinimum = (title: string) => (title.trim() ? suggestSetup(title).setup.minimumText : '');

// A habit left completely blank is just an unused slot.
export const filledHabits = (habits: OnboardingHabit[]) =>
  habits.filter((habit) => habit.title.trim() || habit.minimum.trim());

export function onboardingHabitErrors(habit: OnboardingHabit) {
  const { values } = onboardingHabitSetup(habit);
  // The identity comes with the habit, so it's never asked for here.
  const { identityId: _identity, ...errors } = validateHabitForm(values, 'identity');
  return errors;
}

export const REMINDER_CHOICES = ['07:00', '08:00', '12:00', '18:00', '20:00', '21:00'];

export const REMINDER_TITLE = 'Time for your habits';
export const REMINDER_BODY = 'A small version still counts.';

export interface ReminderTime {
  hour: number;
  minute: number;
}

// Takes 7:30, 07:30 or 19:05. Null means it isn't a time.
export function parseReminderTime(text: string): ReminderTime | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export const reminderKey = ({ hour, minute }: ReminderTime) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

// Mirrors the rules in PLAN.md, in the app's own calm voice.
export const STREAK_RULES = [
  {
    title: 'A small version still counts',
    body: 'Every habit has a minimum version. On a hard day, doing that keeps your streak going.',
  },
  {
    title: 'You have until the next midnight',
    body: 'Forgot to log? You can still log a day until midnight the day after.',
  },
  {
    title: 'Skipping is allowed',
    body: "Sick or away? Skip with a reason, up to twice in 7 days. It pauses your streak and doesn't break it.",
  },
  {
    title: 'Grace Days have your back',
    body: 'Every 7 days in a row earns a Grace Day, up to 3. If you miss a day, one is used for you and your streak carries on.',
  },
  {
    title: 'A miss can be repaired',
    body: "On the next scheduled day, do one and a half times the usual. For a yes or no habit, do the full version and the minimum. It's there if you want it.",
  },
];

export const MISS_REASONS = [
  { value: 'tired', label: 'Too tired' },
  { value: 'forgot', label: 'I forgot' },
  { value: 'no_time', label: 'No time' },
  { value: 'too_big', label: 'It felt too big' },
] as const;
