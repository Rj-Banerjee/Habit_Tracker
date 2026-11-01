import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyHabitForm,
  HabitChanges,
  HabitDetail,
  habitFormFromDetail,
  HabitFormField,
  HabitFormValues,
  HabitInput,
  habitLimitMessage,
  HabitType,
  hasErrors,
  Identity,
  IDENTITY_TOKENS,
  IdentityToken,
  toHabitInput,
  validateHabitForm,
} from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// The longest values the database accepts. See docs/handoff/habit-creation-notes.md.
export const FIELD_LIMITS = {
  title: 100,
  unit: 30,
  milestoneLabel: 40,
  identityName: 80,
  whyText: 2000,
} as const;

// The form's order, so the first problem is the one nearest the top.
const FIELD_ORDER: HabitFormField[] = [
  'identityId',
  'title',
  'target',
  'scheduleDays',
  'minimumDescription',
  'minimumTarget',
  'milestoneAmount',
  'milestoneLabel',
];

// Everything updateHabit can change. A null leaves a field as it was.
const EDITABLE_FIELDS = [
  'title',
  'target',
  'unit',
  'scheduleDays',
  'levels',
  'voiceAliases',
  'milestoneAmount',
  'milestoneLabel',
] as const;

export interface NewIdentity {
  name: string;
  colourToken: IdentityToken;
  whyText: string;
}

type Status = 'loading' | 'failed' | 'limit' | 'ready';

export const usesTarget = (type: HabitType) => type === 'count' || type === 'duration';

const firstFreeColour = (identities: Identity[]) =>
  IDENTITY_TOKENS.find((token) => !identities.some((i) => i.colour_token === token)) ??
  IDENTITY_TOKENS[0];

const blankIdentity = (identities: Identity[]): NewIdentity => ({
  name: '',
  colourToken: firstFreeColour(identities),
  whyText: '',
});

// A full version that only repeats the name stays blank, so renaming the habit
// carries through instead of leaving the old name behind.
function formFromHabit(habit: HabitDetail): HabitFormValues {
  const form = habitFormFromDetail(habit);
  return form.fullDescription === form.title ? { ...form, fullDescription: '' } : form;
}

// Switching type keeps what was typed in case they switch back, but a yes-or-no
// or quit habit must not save or trip over a target it no longer shows.
const visibleValues = (values: HabitFormValues): HabitFormValues =>
  usesTarget(values.type) ? values : { ...values, target: '', unit: '', minimumTarget: '' };

function findProblems(values: HabitFormValues, draft: NewIdentity | null) {
  // The identity of a new draft only exists once the habit is saved.
  const identityId = draft ? 'new' : values.identityId;
  const problems = validateHabitForm({ ...visibleValues(values), identityId });
  if (draft && !draft.name.trim()) problems.identityId = 'Give the identity a name';
  return problems;
}

function changedFields(before: HabitInput, after: HabitInput): HabitChanges {
  const changed = EDITABLE_FIELDS.filter(
    (field) =>
      after[field] !== null && JSON.stringify(after[field]) !== JSON.stringify(before[field])
  );
  return Object.fromEntries(changed.map((field) => [field, after[field]]));
}

const snapshot = (values: HabitFormValues) =>
  JSON.stringify({ ...values, scheduleDays: [...values.scheduleDays].sort((a, b) => a - b) });

interface HabitFormOptions {
  userId: string;
  habitId?: string;
  onDone: () => void;
}

export function useHabitForm({ userId, habitId, onDone }: HabitFormOptions) {
  const [status, setStatus] = useState<Status>('loading');
  const [limitMessage, setLimitMessage] = useState('');
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [initial, setInitial] = useState(emptyHabitForm);
  const [values, setValues] = useState(emptyHabitForm);
  const [draft, setDraft] = useState<NewIdentity | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // A state update comes too late to stop a double tap.
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      const [list, habit, allowance] = await Promise.all([
        tracker.listIdentities(),
        habitId ? tracker.getHabit(habitId) : null,
        habitId ? null : tracker.getHabitAllowance(),
      ]);
      if (allowance && !allowance.can_add) {
        setLimitMessage(habitLimitMessage(allowance.allowed, allowance.active));
        setStatus('limit');
        return;
      }
      const start = habit
        ? formFromHabit(habit)
        : emptyHabitForm(list.length === 1 ? list[0].id : null);
      setIdentities(list);
      setInitial(start);
      setValues(start);
      setDraft(!habit && list.length === 0 ? blankIdentity(list) : null);
      setStatus('ready');
    } catch {
      setStatus('failed');
    }
  }, [habitId]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = () => {
    setStatus('loading');
    load();
  };

  const set = <K extends HabitFormField>(field: K, value: HabitFormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));

  const chooseIdentity = (id: string) => {
    setDraft(null);
    set('identityId', id);
  };

  const toggleNewIdentity = () =>
    setDraft((current) => (current ? null : blankIdentity(identities)));

  // The identity is kept even if the habit then fails, so a retry can't make a second one.
  const saveDraft = async (identity: NewIdentity) => {
    const saved = await tracker.createIdentity(
      userId,
      identity.name.trim(),
      identity.colourToken,
      identity.whyText.trim() || undefined
    );
    setIdentities((current) => [...current, saved]);
    setDraft(null);
    set('identityId', saved.id);
    return saved.id;
  };

  const run = async (action: () => Promise<unknown>) => {
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await action();
      onDone();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  // Returns the first field with a problem, for the screen to scroll to.
  const save = async (): Promise<HabitFormField | null> => {
    if (busy.current) return null;
    setAttempted(true);
    const problems = findProblems(values, draft);
    if (hasErrors(problems)) return FIELD_ORDER.find((field) => problems[field]) ?? null;

    await run(async () => {
      if (habitId) {
        const changes = changedFields(
          toHabitInput(visibleValues(initial)),
          toHabitInput(visibleValues(values))
        );
        if (Object.keys(changes).length > 0) await tracker.updateHabit(habitId, changes);
        return;
      }
      const identityId = draft ? await saveDraft(draft) : values.identityId;
      await tracker.createHabit(toHabitInput({ ...visibleValues(values), identityId }));
    });
    return null;
  };

  const archive = async () => {
    if (busy.current || !habitId) return;
    await run(() => tracker.archiveHabit(habitId));
  };

  const dirty =
    snapshot(values) !== snapshot(initial) ||
    (draft !== null && (draft.name.trim() !== '' || draft.whyText.trim() !== ''));

  return {
    status,
    retry,
    limitMessage,
    isEditing: !!habitId,
    identities,
    values,
    initial,
    set,
    errors: attempted ? findProblems(values, draft) : {},
    draft,
    setDraft,
    chooseIdentity,
    toggleNewIdentity,
    saving,
    saveError,
    dirty,
    save,
    archive,
    // The server can't blank these yet, so saving leaves the old value in place.
    unitKept: !!habitId && !!initial.unit && !values.unit.trim(),
    milestoneKept:
      !!habitId &&
      !!initial.milestoneAmount &&
      !values.milestoneAmount.trim() &&
      !values.milestoneLabel.trim(),
  };
}
