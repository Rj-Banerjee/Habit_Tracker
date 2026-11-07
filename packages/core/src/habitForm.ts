import { HabitDetail, HabitInput, HabitType, LevelOption } from './api';
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
}

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
  if (values.scheduleDays.length === 0) errors.scheduleDays = 'Choose at least one day';
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

export function toHabitInput(values: HabitFormValues): HabitInput {
  return {
    identityId: values.identityId ?? '',
    title: values.title.trim(),
    type: values.type,
    target: toNumber(values.target),
    unit: values.unit.trim() || null,
    scheduleDays: [...values.scheduleDays].sort((a, b) => a - b),
    levels: formLevels(values),
    voiceAliases: values.voiceAliases
      .split(',')
      .map((alias) => alias.trim())
      .filter(Boolean),
    milestoneAmount: toNumber(values.milestoneAmount),
    milestoneLabel: values.milestoneLabel.trim() || null,
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
