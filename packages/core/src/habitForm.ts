import { HabitDetail, HabitFrequency, HabitInput, HabitType, LevelOption, TimeOfDay } from './api';
import { endsAfterDays } from './habitSetup';
import { IdentityToken } from './tokens';

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const HABIT_TYPE_LABELS: Record<HabitType, string> = {
  boolean: 'Yes or no',
  count: 'Count',
  duration: 'Duration',
  quit: 'Quit',
};

export const IDENTITY_TOKENS: IdentityToken[] = [
  'identity-1',
  'identity-2',
  'identity-3',
  'identity-4',
  'identity-5',
  'identity-6',
  'identity-7',
  'identity-8',
];

// The longest values the database accepts.
export const FIELD_LIMITS = {
  title: 100,
  unit: 30,
  levelDescription: 200,
  milestoneLabel: 40,
  identityName: 80,
  whyText: 2000,
} as const;

// Text fields hold what the user typed, so numbers stay strings until they save.
export interface HabitFormValues {
  identityId: string | null;
  title: string;
  type: HabitType;
  target: string;
  unit: string;
  scheduleDays: number[];
  fullDescription: string;
  minimumDescription: string;
  minimumTarget: string;
  setupDescription: string;
  voiceAliases: string;
  milestoneAmount: string;
  milestoneLabel: string;
  frequency: HabitFrequency;
  perWeek: number;
  timeOfDay: TimeOfDay;
  reminderTime: string | null;
  // "End this habit": off, after a number of days from the start, or on a date.
  endMode: EndMode;
  endAfterDays: string;
  endsOn: string;
}

export type EndMode = 'never' | 'after' | 'on';
export const MAX_PER_WEEK = 6;

export type HabitFormField = keyof HabitFormValues;
export type HabitFormErrors = Partial<Record<HabitFormField, string>>;

export const emptyHabitForm = (identityId: string | null = null): HabitFormValues => ({
  identityId,
  title: '',
  type: 'boolean',
  target: '',
  unit: '',
  scheduleDays: ALL_DAYS,
  fullDescription: '',
  minimumDescription: '',
  minimumTarget: '',
  setupDescription: '',
  voiceAliases: '',
  milestoneAmount: '',
  milestoneLabel: '',
  frequency: 'days',
  perWeek: 3,
  timeOfDay: 'anytime',
  reminderTime: null,
  endMode: 'never',
  endAfterDays: '',
  endsOn: '',
});

export const usesTarget = (type: HabitType) => type === 'count' || type === 'duration';

const toNumber = (value: string) => {
  const number = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(number) && number > 0 ? number : null;
};

// Mirrors the server's checks so people see problems before saving. The server
// still has the final word. newIdentityName is set while adding an identity, which
// stands in for choosing one.
export function validateHabitForm(
  values: HabitFormValues,
  newIdentityName: string | null = null
): HabitFormErrors {
  const errors: HabitFormErrors = {};

  if (newIdentityName !== null) {
    if (!newIdentityName.trim()) errors.identityId = 'Give the identity a name';
  } else if (!values.identityId) {
    errors.identityId = 'Choose an identity';
  }
  if (!values.title.trim()) errors.title = 'Give the habit a name';
  if (values.frequency === 'days' && values.scheduleDays.length === 0) {
    errors.scheduleDays = 'Choose at least one day';
  }
  if (values.frequency === 'per_week' && !(values.perWeek >= 1 && values.perWeek <= MAX_PER_WEEK)) {
    errors.scheduleDays = 'Choose 1 to 6 times a week';
  }
  if (values.endMode === 'after' && !(Number(values.endAfterDays.trim()) >= 1)) {
    errors.endsOn = 'Enter a number of days';
  }
  if (values.endMode === 'on' && !/^\d{4}-\d{2}-\d{2}$/.test(values.endsOn)) {
    errors.endsOn = 'Choose an end date';
  }
  if (usesTarget(values.type) && toNumber(values.target) === null) {
    errors.target = 'Enter a number above 0';
  }
  if (!values.minimumDescription.trim()) {
    errors.minimumDescription = 'Describe the smallest version that still counts';
  }
  if (values.minimumTarget.trim() && toNumber(values.minimumTarget) === null) {
    errors.minimumTarget = 'Enter a number above 0';
  }

  const fullTarget = toNumber(values.target);
  const minimumTarget = toNumber(values.minimumTarget);
  if (fullTarget !== null && minimumTarget !== null && minimumTarget >= fullTarget) {
    errors.minimumTarget = 'Make this smaller than the full target';
  }

  if (values.milestoneAmount.trim() && toNumber(values.milestoneAmount) === null) {
    errors.milestoneAmount = 'Enter a number above 0';
  }
  if (values.milestoneAmount.trim() && !values.milestoneLabel.trim()) {
    errors.milestoneLabel = 'Name the milestone, such as "book"';
  }
  if (values.milestoneLabel.trim() && !values.milestoneAmount.trim()) {
    errors.milestoneAmount = 'Enter how much makes one milestone';
  }

  return errors;
}

export const hasErrors = (errors: HabitFormErrors) => Object.keys(errors).length > 0;

function formLevels(values: HabitFormValues): LevelOption[] {
  const target = toNumber(values.target);
  const levels: LevelOption[] = [
    { level: 'full', description: values.fullDescription.trim() || values.title.trim(), target },
    {
      level: 'minimum',
      description: values.minimumDescription.trim(),
      target: toNumber(values.minimumTarget),
    },
  ];
  if (values.setupDescription.trim()) {
    levels.push({ level: 'setup', description: values.setupDescription.trim(), target: null });
  }
  return levels;
}

// The last day the habit is due, or null. "After N days" counts from its start.
export function formEndDate(values: HabitFormValues, startDate: string): string | null {
  if (values.endMode === 'after' && /^\d+$/.test(values.endAfterDays.trim())) {
    return endsAfterDays(startDate, Number(values.endAfterDays));
  }
  if (values.endMode === 'on' && values.endsOn) return values.endsOn;
  return null;
}

export function toHabitInput(values: HabitFormValues, startDate = ''): HabitInput {
  const weekly = values.frequency === 'per_week';
  return {
    identityId: values.identityId ?? '',
    title: values.title.trim(),
    type: values.type,
    target: toNumber(values.target),
    unit: values.unit.trim() || null,
    // A times-per-week habit can fall on any day.
    scheduleDays: weekly ? ALL_DAYS : [...values.scheduleDays].sort((a, b) => a - b),
    levels: formLevels(values),
    voiceAliases: values.voiceAliases
      .split(',')
      .map((alias) => alias.trim())
      .filter(Boolean),
    milestoneAmount: toNumber(values.milestoneAmount),
    milestoneLabel: values.milestoneLabel.trim() || null,
    frequency: values.frequency,
    perWeek: weekly ? values.perWeek : null,
    timeOfDay: values.timeOfDay,
    reminderTime: values.reminderTime,
    endsOn: formEndDate(values, startDate),
  };
}

// Prefills the edit form.
export function habitFormFromDetail(habit: HabitDetail): HabitFormValues {
  const level = (name: string) => habit.habit_levels.find((l) => l.level === name);
  return {
    identityId: habit.identity_id,
    title: habit.title,
    type: habit.type,
    target: habit.target?.toString() ?? '',
    unit: habit.unit ?? '',
    scheduleDays: habit.schedule_days,
    fullDescription: level('full')?.description ?? '',
    minimumDescription: level('minimum')?.description ?? '',
    minimumTarget: level('minimum')?.target?.toString() ?? '',
    setupDescription: level('setup')?.description ?? '',
    voiceAliases: habit.voice_aliases.join(', '),
    milestoneAmount: habit.milestone_amount?.toString() ?? '',
    milestoneLabel: habit.milestone_label ?? '',
    frequency: habit.frequency ?? 'days',
    perWeek: habit.per_week ?? 3,
    timeOfDay: habit.time_of_day ?? 'anytime',
    reminderTime: habit.reminder_time?.slice(0, 5) ?? null,
    endMode: habit.ends_on ? 'on' : 'never',
    endAfterDays: '',
    endsOn: habit.ends_on ?? '',
  };
}

export function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
}

// There's no limit on habits. Past this many, one gentle tip, shown once.
export const HABIT_TIP_AFTER = 6;
export const HABIT_TIP = 'habit-tip';
export const HABIT_TIP_TEXT = 'Starting with a few makes them stick.';

export const shouldShowHabitTip = (activeHabits: number, seenTips: readonly string[] = []) =>
  activeHabits > HABIT_TIP_AFTER && !seenTips.includes(HABIT_TIP);
