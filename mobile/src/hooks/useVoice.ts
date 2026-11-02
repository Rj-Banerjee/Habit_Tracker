import { useEffect, useRef, useState } from 'react';
import {
  answerWhich,
  describeIntents,
  isUndoPhrase,
  isVoiceAction,
  runVoiceAction,
  TodayRow,
  VoiceAction,
  VoiceIntent,
  VoiceOption,
  VoiceQuestion,
  VoiceUndo,
  whichQuestion,
} from '@habit-tracker/core';
import { ai } from '../services/ai';
import { speak } from '../services/speak';
import { tracker } from '../services/tracker';

export type Voice = ReturnType<typeof useVoice>;

export interface VoiceBanner {
  id: number;
  text: string;
  heard: string | null;
}

type Phase = 'idle' | 'working' | 'asking' | 'confirming' | 'unclear' | 'noMatch';

interface VoiceOptions {
  rows: TodayRow[];
  refresh: () => Promise<unknown>;
  onClose: () => void;
  onAskCoach: (question: string) => void;
}

export function useVoice({ rows, refresh, onClose, onAskCoach }: VoiceOptions) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [question, setQuestion] = useState<VoiceQuestion | null>(null);
  const [draft, setDraft] = useState('');
  // Shown wherever a result is, so a mishearing is easy to spot.
  const [heard, setHeard] = useState<string | null>(null);
  const [pending, setPending] = useState<VoiceIntent[]>([]);
  const [names, setNames] = useState<string[]>([]);
  // The banner is set in the same tick as the words arrive, before state catches up.
  const latestHeard = useRef<string | null>(null);
  const [banner, setBanner] = useState<VoiceBanner | null>(null);
  // Outlives the banner, so saying "undo that" works after the 10 seconds.
  const lastLogged = useRef<VoiceUndo[]>([]);
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
  };

  const finish = (text: string) => {
    speak(text);
    setBanner({ id: nextBanner.current++, text, heard: latestHeard.current });
    reset();
    onClose();
    void refresh();
  };

  const runAll = async (actions: VoiceAction[]) => {
    const outcomes = [];
    for (const action of actions) outcomes.push(await runVoiceAction(tracker, action, rows));
    lastLogged.current = outcomes.map((outcome) => outcome.undo);
    return outcomes.map((outcome) => outcome.say).join(' ');
  };

  const undo = async () => {
    const logged = lastLogged.current;
    lastLogged.current = [];
    setBanner(null);
    if (logged.length === 0) {
      speak('Nothing to undo.');
      return;
    }
    try {
      for (const { habitId, date } of logged) await tracker.undoLog(habitId, date);
      speak('Undone.');
    } catch {
      // The sheet may be closed by now, so this goes where it will be seen.
      lastLogged.current = logged;
      setBanner({
        id: nextBanner.current++,
        text: "That couldn't be undone. Try again.",
        heard: null,
      });
    }
    void refresh();
  };

  const fail = (err: unknown) => {
    setPhase('idle');
    setProblem((err as Error).message);
  };

  const run = async (intents: VoiceIntent[]) => {
    setPhase('working');
    try {
      const actions = intents.filter(isVoiceAction);
      const said = actions.length > 0 ? await runAll(actions) : '';

      const which = intents.find((intent) => intent.intent === 'ask_which');
      if (which) {
        if (said) void refresh();
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

      finish(said);
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
    latestHeard.current = text;
    try {
      const parsed = await ai.parseVoice(text);
      if (parsed.level === 'none') {
        setPhase('noMatch');
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
      finish(await runAll([answerWhich(question, option)]));
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
