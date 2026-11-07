import { useEffect, useMemo, useRef, useState } from 'react';
import {
  decodeMinimum,
  emptyHabitForm,
  HabitChanges,
  HabitDetail,
  habitFormFromDetail,
  HabitFormField,
  HabitFormValues,
  HabitInput,
  HabitSetup,
  hasErrors,
  Identity,
  IDENTITY_TOKENS,
  IdentityToken,
  localDate,
  NewIdentityInput,
  parseHabitName,
  reviewLines,
  toHabitInput,
  usesTarget,
  validateHabitForm,
} from '@habit-tracker/core';
import { tracker } from '../services/tracker';
import { useHabitSetup } from './useHabitSetup';

// The form's order, so the first problem is the one nearest the top.
const FIELD_ORDER: HabitFormField[] = [
  'title',
  'target',
  'scheduleDays',
  'minimumDescription',
  'endsOn',
  'identityId',
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
  'frequency',
  'perWeek',
  'timeOfDay',
  'reminderTime',
  'endsOn',
] as const;

// Fields a suggestion fills in, until the person changes them.
type Suggested =
  | 'type'
  | 'target'
  | 'unit'
  | 'frequency'
  | 'perWeek'
  | 'timeOfDay'
  | 'minimumDescription'
  | 'setupDescription'
  | 'voiceAliases'
  | 'reminderTime'
  | 'identityId';

export interface NewIdentity {
  name: string;
  colourToken: IdentityToken;
  whyText: string;
}

type Status = 'loading' | 'failed' | 'ready';

const firstFreeColour = (identities: Identity[]) =>
  IDENTITY_TOKENS.find((token) => !identities.some((i) => i.colour_token === token)) ??
  IDENTITY_TOKENS[0];

const blankIdentity = (identities: Identity[], name = ''): NewIdentity => ({
  name,
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

// A suggestion, written into every field the person hasn't changed.
function withSuggestion(values: HabitFormValues, setup: HabitSetup, mine: Set<Suggested>): HabitFormValues {
  const next = { ...values };
  const fill = <K extends Suggested & keyof HabitFormValues>(field: K, value: HabitFormValues[K]) => {
    if (!mine.has(field)) next[field] = value;
  };
  fill('type', setup.type);
  fill('target', setup.target !== null ? String(setup.target) : '');
  fill('unit', setup.unit ?? '');
  fill('frequency', setup.frequency);
  if (setup.perWeek !== null) fill('perWeek', setup.perWeek);
  fill('timeOfDay', setup.timeOfDay);
  fill('minimumDescription', setup.minimumText);
  fill('setupDescription', setup.setup);
  fill('voiceAliases', setup.voiceAliases.join(', '));
  fill('reminderTime', setup.reminderTime);
  return next;
}

interface HabitFormOptions {
  habitId?: string;
  initialTitle?: string;
  onDone: () => void;
}

export function useHabitForm({ habitId, initialTitle = '', onDone }: HabitFormOptions) {
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [initial, setInitial] = useState(emptyHabitForm);
  const [values, setValues] = useState(emptyHabitForm);
  const [draft, setDraft] = useState<NewIdentity | null>(null);
  // A new habit starts today, on this phone's clock, so "after 30 days" counts from here.
  const [startsOn, setStartsOn] = useState(() =>
    localDate(Intl.DateTimeFormat().resolvedOptions().timeZone)
  );
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The minimum's amount, read from its text, unless they turned it down.
  const [minimumDeclined, setMinimumDeclined] = useState(false);
  // "We set these up for you" was accepted.
  const [accepted, setAccepted] = useState(false);
  // They chose or named an identity themselves, which counts as an unsaved change.
  const [identityChanged, setIdentityChanged] = useState(false);
  // Fields the person changed, which suggestions then leave alone.
  const mine = useRef(new Set<Suggested>());
  // A state update comes too late to stop a double tap.
  const busy = useRef(false);

  const creating = !habitId;
  const suggestion = useHabitSetup(values.title, creating && status === 'ready');

  useEffect(() => {
    Promise.all([tracker.listIdentities(), habitId ? tracker.getHabit(habitId) : null])
      .then(([list, habit]) => {
        const start = habit
          ? formFromHabit(habit)
          : { ...emptyHabitForm(list.length === 1 ? list[0].id : null), title: initialTitle };
        setIdentities(list);
        setInitial(start);
        setValues(start);
        setDraft(null);
        if (habit?.starts_on) setStartsOn(habit.starts_on);
        setStatus('ready');
      })
      .catch(() => setStatus('failed'));
  }, [habitId, initialTitle, attempt]);

  // Suggestions follow the name as it changes, into the fields they haven't changed.
  const setup = suggestion.setup;
  const named = values.title.trim() !== '';
  useEffect(() => {
    if (!creating || status !== 'ready' || !named) return;
    setValues((current) => withSuggestion(current, setup, mine.current));
    if (mine.current.has('identityId')) return;
    const existing = identities.find((i) => i.name.toLowerCase() === setup.identity.toLowerCase());
    if (existing) {
      setDraft(null);
      setValues((current) => ({ ...current, identityId: existing.id }));
    } else {
      setDraft((current) => ({ ...(current ?? blankIdentity(identities)), name: setup.identity }));
      setValues((current) => ({ ...current, identityId: null }));
    }
  }, [setup, named, creating, status, identities]);

  const retry = () => {
    setStatus('loading');
    setAttempt((count) => count + 1);
  };

  const set = <K extends HabitFormField>(field: K, value: HabitFormValues[K]) => {
    mine.current.add(field as Suggested);
    setValues((current) => ({ ...current, [field]: value }));
  };

  const chooseIdentity = (id: string) => {
    mine.current.add('identityId');
    setIdentityChanged(true);
    setDraft(null);
    setValues((current) => ({ ...current, identityId: id }));
  };

  const nameNewIdentity = (name: string) => {
    mine.current.add('identityId');
    setIdentityChanged(true);
    setValues((current) => ({ ...current, identityId: null }));
    setDraft((current) => ({ ...(current ?? blankIdentity(identities)), name }));
  };

  const toggleNewIdentity = () => {
    mine.current.add('identityId');
    setIdentityChanged(true);
    setDraft((current) => (current ? null : blankIdentity(identities)));
  };

  const changeDraft = (next: NewIdentity | null) => {
    mine.current.add('identityId');
    setIdentityChanged(true);
    setDraft(next);
  };

  // On a new habit, "Run 20 km" saves as Run with a target of 20 km.
  const parsedName = useMemo(() => parseHabitName(values.title), [values.title]);
  const unit = visibleValues(values).unit.trim() || null;
  const minimum = useMemo(
    () => decodeMinimum(values.minimumDescription, unit),
    [values.minimumDescription, unit]
  );

  const prepared = (): HabitFormValues => {
    const shown = visibleValues(values);
    if (!creating) return shown;
    const title = parsedName.target !== null ? parsedName.title : shown.title;
    const minimumTarget =
      !minimumDeclined && minimum.target !== null && usesTarget(shown.type) ? String(minimum.target) : '';
    return { ...shown, title, minimumTarget };
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

  // Returns the first field with a problem, for the screen to scroll to. Never waits
  // on the AI: it saves whatever the library, parsing and the person gave it.
  const save = async (): Promise<HabitFormField | null> => {
    if (busy.current) return null;
    setAttempted(true);
    const ready = prepared();
    const problems = findProblems(ready, draft);
    if (hasErrors(problems)) return FIELD_ORDER.find((field) => problems[field]) ?? null;

    const input = toHabitInput(ready, startsOn);
    const newIdentity = draft ? toNewIdentity(draft) : undefined;

    await run(async () => {
      if (habitId) {
        const changes = changedFields(toHabitInput(visibleValues(initial), startsOn), input);
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
    (draft !== null && identityChanged && (draft.name.trim() !== '' || draft.whyText.trim() !== ''));

  const identityName = draft
    ? draft.name
    : (identities.find((i) => i.id === values.identityId)?.name ?? '');

  return {
    status,
    retry,
    isEditing: !!habitId,
    identities,
    values,
    initial,
    set,
    errors: attempted ? findProblems(prepared(), draft) : {},
    draft,
    setDraft: changeDraft,
    chooseIdentity,
    nameNewIdentity,
    toggleNewIdentity,
    identityName,
    saving,
    saveError,
    dirty,
    save,
    archive,
    // What the create form shows from the suggestion.
    suggestion,
    parsedName,
    minimum: { ...minimum, declined: minimumDeclined },
    setMinimumDeclined,
    review: reviewLines({
      type: values.type,
      unit,
      identity: identityName,
      reminderTime: values.reminderTime,
      setup: values.setupDescription.trim(),
      voiceAliases: values.voiceAliases
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
    }),
    accepted,
    acceptAll: () => setAccepted(true),
    startsOn,
  };
}
