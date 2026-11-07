import { useEffect, useMemo, useState } from 'react';
import { fromAiSuggestion, HabitSetup, normalise, suggestSetup } from '@habit-tracker/core';
import { ai } from '../services/ai';
import { useEntitlements } from './useEntitlements';

// A pause after typing before the AI is asked, so a name being typed costs one call.
export const SUGGEST_AFTER_MS = 600;
const MIN_LETTERS = 3;

// Kept for the session, so going back to a name doesn't ask again.
const answers = new Map<string, HabitSetup>();
export const forgetSuggestions = () => answers.clear();

// What the habit form suggests for a name. The library and parsing answer at once; on
// Pro, a name the library doesn't know is also sent to the AI, and its answer replaces
// the guess when it arrives. Anything wrong with the AI just leaves the guess.
export function useHabitSetup(name: string, enabled: boolean) {
  const { ready, can } = useEntitlements();
  // Free never calls the model, so nothing is sent until the plan is known.
  const useAi = enabled && ready && can('ai.setup');
  const local = useMemo(() => suggestSetup(name), [name]);
  const key = normalise(name);
  const [answer, setAnswer] = useState<{ key: string; setup: HabitSetup } | null>(null);
  // The name the AI couldn't answer for, so the form stops waiting.
  const [failed, setFailed] = useState<string | null>(null);

  const wanted = useAi && !local.known && key.length >= MIN_LETTERS;

  // Asked before in this session: no need to wait or ask again.
  const cached = wanted ? answers.get(key) : undefined;

  useEffect(() => {
    if (!wanted || cached) return;
    let current = true;
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => ai.suggestSetup(name))
        .then((raw) => {
          const setup = fromAiSuggestion(raw, local.setup);
          answers.set(key, setup);
          if (current) setAnswer({ key, setup });
        })
        // Slow, down, refused or offline: the library and parsing already answered.
        .catch(() => current && setFailed(key));
    }, SUGGEST_AFTER_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [wanted, cached, key, name, local]);

  const fromAi = cached ?? (wanted && answer?.key === key ? answer.setup : null);
  return {
    setup: fromAi ?? local.setup,
    known: local.known,
    // Waiting on the AI for this name.
    pending: wanted && !fromAi && failed !== key,
  };
}
