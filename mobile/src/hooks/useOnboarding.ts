import { useRef, useState } from 'react';
import {
  blankOnboardingHabit,
  filledHabits,
  hasErrors,
  IDENTITY_TOKENS,
  onboardingHabitErrors,
  onboardingHabitSetup,
  OnboardingHabit,
  toHabitInput,
} from '@habit-tracker/core';
import { reminderMessage, syncHabitReminders } from '../services/reminders';
import { analytics } from '../services/analytics';
import { tracker } from '../services/tracker';

export type OnboardingStep = 'habits' | 'reminder' | 'rules';
export const STEPS: OnboardingStep[] = ['habits', 'reminder', 'rules'];

export function useOnboarding(userId: string, onDone: () => void) {
  const [step, setStep] = useState<OnboardingStep>('habits');
  const [habits, setHabits] = useState<OnboardingHabit[]>([blankOnboardingHabit()]);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const busy = useRef(false);
  // How far saving got, so a retry carries on rather than making duplicates. Identities
  // come with the habits, so each is made once, by name.
  const saved = useRef<{ identities: Map<string, string> | null; count: number }>({
    identities: null,
    count: 0,
  });

  const go = (next: OnboardingStep) => {
    setAttempted(false);
    setProblem(null);
    setStep(next);
    // Which step someone reached, and how many habits they'd saved by then.
    analytics.track('onboarding_step', { step: next, habits: saved.current.count });
  };

  const back = () => {
    const index = STEPS.indexOf(step);
    if (index > 0 && !saving) go(STEPS[index - 1]);
    return index > 0;
  };

  const setHabit = (index: number, patch: Partial<OnboardingHabit>) =>
    setHabits((current) =>
      current.map((habit, at) => (at === index ? { ...habit, ...patch } : habit))
    );

  const addHabit = () => setHabits((current) => [...current, blankOnboardingHabit()]);

  const removeHabit = (index: number) =>
    setHabits((current) => current.filter((_, at) => at !== index));

  const work = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setProblem(null);
    try {
      await action();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const saveHabits = async () => {
    setAttempted(true);
    const toSave = filledHabits(habits);
    if (toSave.length === 0 || toSave.some((habit) => hasErrors(onboardingHabitErrors(habit)))) {
      return;
    }

    await work(async () => {
      const identities =
        saved.current.identities ??
        new Map((await tracker.listIdentities()).map((identity) => [identity.name, identity.id]));
      saved.current.identities = identities;
      for (const habit of toSave.slice(saved.current.count)) {
        const { values, identity } = onboardingHabitSetup(habit);
        const known = identities.get(identity);
        const input = toHabitInput({ ...values, identityId: known ?? null });
        if (known) {
          await tracker.createHabit(input);
        } else {
          const id = await tracker.createHabit(input, {
            name: identity,
            colourToken: IDENTITY_TOKENS[identities.size % IDENTITY_TOKENS.length],
          });
          identities.set(identity, (await tracker.getHabit(id)).identity_id);
        }
        saved.current.count += 1;
      }
      go('reminder');
    });
  };

  // Each habit already has its own reminder time. This lets them through, or not.
  const saveReminder = (turnOn: boolean) =>
    work(async () => {
      if (turnOn) {
        const result = await syncHabitReminders({ ask: true });
        setReminderNote(reminderMessage(result));
      }
      go('rules');
    });

  const finish = () =>
    work(async () => {
      await tracker.finishOnboarding(userId);
      analytics.track('onboarding_step', { step: 'finished', habits: saved.current.count });
      onDone();
    });

  return {
    step,
    stepNumber: STEPS.indexOf(step) + 1,
    habits,
    setHabit,
    addHabit,
    removeHabit,
    attempted,
    saveHabits,
    reminderNote,
    saveReminder,
    finish,
    saving,
    problem,
    back,
  };
}
