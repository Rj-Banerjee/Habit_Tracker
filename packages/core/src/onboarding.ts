import { emptyHabitForm, HabitFormValues, validateHabitForm } from './habitForm';

export const IDENTITY_SUGGESTIONS = [
  { name: 'The Reader', example: 'Read', minimum: 'One page' },
  { name: 'The Athlete', example: 'Go for a run', minimum: 'Put on my shoes and walk for 5 minutes' },
  { name: 'The Calm One', example: 'Meditate', minimum: 'One slow breath' },
  { name: 'The Maker', example: 'Work on my project', minimum: 'Open it and do one small thing' },
  { name: 'The Learner', example: 'Study', minimum: 'Five minutes' },
];

export interface OnboardingHabit {
  title: string;
  minimum: string;
}

export const blankOnboardingHabit = (): OnboardingHabit => ({ title: '', minimum: '' });

export function onboardingHabitForm(habit: OnboardingHabit, identityId: string): HabitFormValues {
  return {
    ...emptyHabitForm(identityId),
    title: habit.title,
    minimumDescription: habit.minimum,
  };
}

// A habit left completely blank is just an unused slot.
export const filledHabits = (habits: OnboardingHabit[]) =>
  habits.filter((habit) => habit.title.trim() || habit.minimum.trim());

export function onboardingHabitErrors(habit: OnboardingHabit) {
  return validateHabitForm(onboardingHabitForm(habit, 'identity'));
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
