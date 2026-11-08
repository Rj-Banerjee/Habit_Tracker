import { useEffect, useRef, useState } from 'react';
import {
  AnalyticsProps,
  LOCKED_VOICE_HINT,
  lockedMessage,
  answerWhich,
  checkinReply,
  describeIntents,
  heardLine,
  isUndoPhrase,
  isVoiceAction,
  matchSimplePhrase,
  mentionsEnergyOrMood,
  parseCheckinPhrase,
  TodayRow,
  VoiceHabit,
  VoiceIntent,
  VoiceOption,
  VoiceQuestion,
  whichQuestion,
} from '@habit-tracker/core';
import { analytics } from '../services/analytics';
import { ai } from '../services/ai';
import { speak } from '../services/speak';
import { tracker } from '../services/tracker';
import { Actions } from './useActions';

export type Voice = ReturnType<typeof useVoice>;

type VoiceOutcome = NonNullable<AnalyticsProps<'voice_used'>['outcome']>;
export interface VoiceInput {
  input: 'speech' | 'typed';
  language: 'en-IN' | 'hi-IN';
}

export interface VoiceBanner {
  id: number;
  text: string;
  heard: string | null;
  canUndo: boolean;
}

type Phase =
  | 'idle'
  | 'working'
  | 'asking'
  | 'confirming'
  | 'unclear'
  | 'noHabit'
  | 'offTopic';

interface VoiceOptions {
  // False on a plan without AI voice: only the phone's own simple phrases work.
  canUseAi?: boolean;
  rows: TodayRow[];
  actions: Actions;
  refresh: () => Promise<unknown>;
  onClose: () => void;
  onAskCoach: (question: string) => void;
  // After a check-in by voice, so the card on Today can catch up.
  onCheckin?: () => void;
}

export function useVoice({ rows, actions, refresh, onClose, onAskCoach, onCheckin, canUseAi = true }: VoiceOptions) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [question, setQuestion] = useState<VoiceQuestion | null>(null);
  const [draft, setDraft] = useState('');
  // Shown wherever a result is, so a mishearing is easy to spot.
  const [heard, setHeard] = useState<string | null>(null);
  const [pending, setPending] = useState<VoiceIntent[]>([]);
  const [habits, setHabits] = useState<VoiceHabit[]>([]);
  const [missingHabit, setMissingHabit] = useState<string | null>(null);
  // The banner is set in the same tick as the words arrive, before state catches up.
  const latestLine = useRef<string | null>(null);
  const [banner, setBanner] = useState<VoiceBanner | null>(null);
  const nextBanner = useRef(1);

  // Only hints, so a failure here costs nothing.
  useEffect(() => {
    tracker
      .listVoiceHabits()
      .then(setHabits)
      .catch(() => {});
  }, [rows.length]);

  const reset = () => {
    setPhase('idle');
    setProblem(null);
    setQuestion(null);
    setDraft('');
    setHeard(null);
    setPending([]);
    setMissingHabit(null);
  };

  const finish = (text: string, canUndo: boolean) => {
    speak(text);
    setBanner({ id: nextBanner.current++, text, heard: latestLine.current, canUndo });
    reset();
    onClose();
  };

  const undo = async () => {
    setBanner(null);
    try {
      speak(await actions.undoLast('voice'));
    } catch {
      // The sheet may be closed by now, so this goes where it will be seen.
      setBanner({
        id: nextBanner.current++,
        text: "That couldn't be undone. Try again.",
        heard: null,
        canUndo: true,
      });
    }
  };

  const fail = (err: unknown) => {
    setPhase('idle');
    setProblem((err as Error).message);
  };

  const run = async (intents: VoiceIntent[]) => {
    setPhase('working');
    try {
      const steps = intents.filter(isVoiceAction);
      const done = steps.length > 0 ? await actions.run(steps, 'voice') : null;

      const which = intents.find((intent) => intent.intent === 'ask_which');
      if (which) {
        setQuestion(which);
        setPhase('asking');
        speak(whichQuestion(which));
        return;
      }

      const coachQuestion = intents.find((intent) => intent.intent === 'ask_coach');
      if (coachQuestion) {
        reset();
        onAskCoach(coachQuestion.question);
        return;
      }

      if (intents.some((intent) => intent.intent === 'undo_last')) {
        reset();
        onClose();
        await undo();
        return;
      }

      finish(done?.say ?? '', done?.canUndo ?? false);
    } catch (err) {
      fail(err);
    }
  };

  // Only the kind of input and what happened are counted, never the words.
  const submit = async (transcript: string, how: VoiceInput = { input: 'typed', language: 'en-IN' }) => {
    const text = transcript.trim();
    if (!text) return;
    const counted = (outcome: VoiceOutcome) => analytics.track('voice_used', { ...how, outcome });
    if (isUndoPhrase(text)) {
      reset();
      onClose();
      await undo();
      return;
    }
    setPhase('working');
    setProblem(null);
    setHeard(text);
    latestLine.current = `Heard: ${text}`;

    const simple = matchSimplePhrase(text, habits);
    // "slept 6 hours, energy low" is today's check-in, on every plan. Sleep alone might be
    // a habit called Sleep, so a habit match wins unless energy or mood was said.
    const checkin = parseCheckinPhrase(text);
    if (checkin && (!simple || mentionsEnergyOrMood(text))) {
      counted('on_phone');
      try {
        await tracker.saveCheckin(checkin, 'voice');
        finish(checkinReply(checkin), false);
        onCheckin?.();
      } catch (err) {
        fail(err);
      }
      return;
    }
    if (simple) {
      counted('on_phone');
      await run([simple]);
      return;
    }

    if (!canUseAi) {
      setDraft(text);
      setPhase('unclear');
      setProblem(`${LOCKED_VOICE_HINT} Understanding anything else is ${lockedMessage('ai.voice').toLowerCase()}`);
      return;
    }

    try {
      const parsed = await ai.parseVoice(text);
      latestLine.current = heardLine(text, parsed.corrected, parsed.intents);
      if (parsed.level === 'no_habit') {
        counted('no_habit');
        setMissingHabit(parsed.missing_habit);
        setPhase('noHabit');
      } else if (parsed.level === 'off_topic') {
        counted('off_topic');
        setPhase('offTopic');
      } else if (parsed.level === 'low' || parsed.intents.length === 0) {
        counted('unclear');
        setDraft(text);
        setPhase('unclear');
        speak("I didn't catch that.");
      } else if (parsed.level === 'medium') {
        counted('confirm');
        setPending(parsed.intents);
        setPhase('confirming');
        speak(`Did you mean: ${describeIntents(parsed.intents)}?`);
      } else {
        const kinds = parsed.intents.map((intent) => intent.intent);
        counted(kinds.includes('ask_which') ? 'which' : kinds.includes('ask_coach') ? 'question' : 'logged');
        await run(parsed.intents);
      }
    } catch (err) {
      counted('failed');
      setDraft(text);
      fail(err);
    }
  };

  const confirm = () => run(pending);

  // "No" goes back to what it heard, ready to fix.
  const reject = () => {
    setDraft(heard ?? '');
    setPending([]);
    setPhase('unclear');
  };

  const answer = async (option: VoiceOption) => {
    if (!question) return;
    setPhase('working');
    try {
      const done = await actions.run([answerWhich(question, option)], 'voice');
      finish(done.say, done.canUndo);
    } catch (err) {
      fail(err);
    }
  };

  return {
    phase,
    problem,
    question,
    draft,
    setDraft,
    heard,
    pending,
    missingHabit,
    names: habits.flatMap((habit) => [habit.title, ...habit.voice_aliases]),
    banner,
    reset,
    submit,
    confirm,
    reject,
    answer,
    undo,
    clearBanner: () => setBanner(null),
  };
}
