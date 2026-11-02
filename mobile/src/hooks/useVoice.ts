import { useEffect, useRef, useState } from 'react';
import {
  answerWhich,
  describeIntents,
  heardLine,
  isUndoPhrase,
  isVoiceAction,
  TodayRow,
  VoiceIntent,
  VoiceOption,
  VoiceQuestion,
  whichQuestion,
} from '@habit-tracker/core';
import { ai } from '../services/ai';
import { speak } from '../services/speak';
import { tracker } from '../services/tracker';
import { Actions } from './useActions';

export type Voice = ReturnType<typeof useVoice>;

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
  rows: TodayRow[];
  actions: Actions;
  refresh: () => Promise<unknown>;
  onClose: () => void;
  onAskCoach: (question: string) => void;
}

export function useVoice({ rows, actions, refresh, onClose, onAskCoach }: VoiceOptions) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [question, setQuestion] = useState<VoiceQuestion | null>(null);
  const [draft, setDraft] = useState('');
  // Shown wherever a result is, so a mishearing is easy to spot.
  const [heard, setHeard] = useState<string | null>(null);
  const [pending, setPending] = useState<VoiceIntent[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [missingHabit, setMissingHabit] = useState<string | null>(null);
  // The banner is set in the same tick as the words arrive, before state catches up.
  const latestLine = useRef<string | null>(null);
  const [banner, setBanner] = useState<VoiceBanner | null>(null);
  const nextBanner = useRef(1);

  // Only hints, so a failure here costs nothing.
  useEffect(() => {
    tracker
      .listVoiceNames()
      .then(setNames)
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

  const submit = async (transcript: string) => {
    const text = transcript.trim();
    if (!text) return;
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
    try {
      const parsed = await ai.parseVoice(text);
      latestLine.current = heardLine(text, parsed.corrected, parsed.intents);
      if (parsed.level === 'no_habit') {
        setMissingHabit(parsed.missing_habit);
        setPhase('noHabit');
      } else if (parsed.level === 'off_topic') {
        setPhase('offTopic');
      } else if (parsed.level === 'low' || parsed.intents.length === 0) {
        setDraft(text);
        setPhase('unclear');
        speak("I didn't catch that.");
      } else if (parsed.level === 'medium') {
        setPending(parsed.intents);
        setPhase('confirming');
        speak(`Did you mean: ${describeIntents(parsed.intents)}?`);
      } else {
        await run(parsed.intents);
      }
    } catch (err) {
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
    names,
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
