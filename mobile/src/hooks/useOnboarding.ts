import { useRef, useState } from 'react';
import {
  blankOnboardingHabit,
  filledHabits,
  hasErrors,
  IDENTITY_SUGGESTIONS,
  MAX_ONBOARDING_HABITS,
  onboardingHabitErrors,
  onboardingHabitForm,
  OnboardingHabit,
  toHabitInput,
} from '@habit-tracker/core';
import { setDailyReminder } from '../services/reminders';
import { tracker } from '../services/tracker';

export type OnboardingStep = 'identity' | 'habits' | 'reminder' | 'rules';
export const STEPS: OnboardingStep[] = ['identity', 'habits', 'reminder', 'rules'];

const COLOUR = 'identity-1';

export function useOnboarding(userId: string, onDone: () => void) {
  const [step, setStep] = useState<OnboardingStep>('identity');
  const [identity, setIdentityName] = useState('');
  const [whyText, setWhyText] = useState('');
  const [habits, setHabits] = useState<OnboardingHabit[]>([blankOnboardingHabit()]);
  const [reminder, setReminder] = useState<string | null>('20:00');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const busy = useRef(false);
  // How far saving got, so a retry carries on rather than making duplicates.
  const saved = useRef<{ identityId: string | null; count: number }>({
    identityId: null,
    count: 0,
  });

  const suggestion = IDENTITY_SUGGESTIONS.find((item) => item.name === identity);

  const go = (next: OnboardingStep) => {
    setAttempted(false);
    setProblem(null);
    setStep(next);
  };

  const back = () => {
    const index = STEPS.indexOf(step);
    if (index > 0 && !saving) go(STEPS[index - 1]);
    return index > 0;
  };

  const identityError = attempted && !identity.trim() ? 'Choose one, or write your own' : undefined;

  const nextFromIdentity = () => {
    setAttempted(true);
    if (identity.trim()) go('habits');
  };

  const setHabit = (index: number, patch: Partial<OnboardingHabit>) =>
    setHabits((current) =>
      current.map((habit, at) => (at === index ? { ...habit, ...patch } : habit))
    );

  const addHabit = () =>
    setHabits((current) =>
      current.length < MAX_ONBOARDING_HABITS ? [...current, blankOnboardingHabit()] : current
    );

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
      for (const habit of toSave.slice(saved.current.count)) {
        const input = toHabitInput(onboardingHabitForm(habit, saved.current.identityId ?? ''));
        if (saved.current.identityId) {
          await tracker.createHabit(input);
        } else {
          const id = await tracker.createHabit(input, {
            name: identity.trim(),
            colourToken: COLOUR,
            whyText: whyText.trim() || undefined,
          });
          saved.current.identityId = (await tracker.getHabit(id)).identity_id;
        }
        saved.current.count += 1;
      }
      go('reminder');
    });
  };

  const saveReminder = () =>
    work(async () => {
      await tracker.setReminderTime(userId, reminder);
      const result = await setDailyReminder(reminder);
      setReminderNote(
        reminder && result === 'denied'
          ? "Notifications are off, so reminders won't arrive. You can turn them on in your phone's settings."
          : null
      );
      go('rules');
    });

  const finish = () =>
    work(async () => {
      await tracker.finishOnboarding(userId);
      onDone();
    });

  return {
    step,
    stepNumber: STEPS.indexOf(step) + 1,
    identity,
    setIdentity: setIdentityName,
    whyText,
    setWhyText,
    identityError,
    suggestion,
    nextFromIdentity,
    habits,
    setHabit,
    addHabit,
    removeHabit,
    attempted,
    saveHabits,
    reminder,
    setReminder,
    reminderNote,
    saveReminder,
    finish,
    saving,
    problem,
    back,
  };
}
