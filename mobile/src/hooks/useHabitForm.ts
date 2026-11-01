import { useEffect, useRef, useState } from 'react';
import {
  emptyHabitForm,
  HabitChanges,
  HabitDetail,
  habitFormFromDetail,
  HabitFormField,
  HabitFormValues,
  HabitInput,
  habitLimitMessage,
  hasErrors,
  Identity,
  IDENTITY_TOKENS,
  IdentityToken,
  NewIdentityInput,
  toHabitInput,
  usesTarget,
  validateHabitForm,
} from '@habit-tracker/core';
import { tracker } from '../services/tracker';

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

// Everything updateHabit can change. A field left out keeps its value, and a null
// clears it.
const EDITABLE_FIELDS = [
  'identityId',
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

const findProblems = (values: HabitFormValues, draft: NewIdentity | null) =>
  validateHabitForm(visibleValues(values), draft && draft.name);

function changedFields(before: HabitInput, after: HabitInput): HabitChanges {
  const changed = EDITABLE_FIELDS.filter(
    (field) => JSON.stringify(after[field]) !== JSON.stringify(before[field])
  );
  return Object.fromEntries(changed.map((field) => [field, after[field]]));
}

const toNewIdentity = (draft: NewIdentity): NewIdentityInput => ({
  name: draft.name.trim(),
  colourToken: draft.colourToken,
  whyText: draft.whyText.trim() || undefined,
});

const snapshot = (values: HabitFormValues) =>
  JSON.stringify({ ...values, scheduleDays: [...values.scheduleDays].sort((a, b) => a - b) });

interface HabitFormOptions {
  habitId?: string;
  onDone: () => void;
}

export function useHabitForm({ habitId, onDone }: HabitFormOptions) {
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
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

  useEffect(() => {
    Promise.all([
      tracker.listIdentities(),
      habitId ? tracker.getHabit(habitId) : null,
      habitId ? null : tracker.getHabitAllowance(),
    ])
      .then(([list, habit, allowance]) => {
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
      })
      .catch(() => setStatus('failed'));
  }, [habitId, attempt]);

  const retry = () => {
    setStatus('loading');
    setAttempt((count) => count + 1);
  };

  const set = <K extends HabitFormField>(field: K, value: HabitFormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));

  const chooseIdentity = (id: string) => {
    setDraft(null);
    set('identityId', id);
  };

  const toggleNewIdentity = () =>
    setDraft((current) => (current ? null : blankIdentity(identities)));

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

    const input = toHabitInput(visibleValues(values));
    const newIdentity = draft ? toNewIdentity(draft) : undefined;

    await run(async () => {
      if (habitId) {
        const changes = changedFields(toHabitInput(visibleValues(initial)), input);
        if (newIdentity) changes.newIdentity = newIdentity;
        if (Object.keys(changes).length > 0) await tracker.updateHabit(habitId, changes);
        return;
      }
      await tracker.createHabit(input, newIdentity);
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
  };
}
