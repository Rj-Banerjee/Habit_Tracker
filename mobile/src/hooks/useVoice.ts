import { useRef, useState } from 'react';
import {
  answerWhich,
  CoachError,
  isVoiceAction,
  runVoiceAction,
  TodayRow,
  VoiceAction,
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
}

type Phase = 'idle' | 'working' | 'asking' | 'noMatch';

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
  const [banner, setBanner] = useState<VoiceBanner | null>(null);
  // Outlives the banner, so saying "undo that" works after the 10 seconds.
  const lastLogged = useRef<VoiceUndo[]>([]);
  const nextBanner = useRef(1);

  const reset = () => {
    setPhase('idle');
    setProblem(null);
    setQuestion(null);
  };

  const finish = (text: string) => {
    speak(text);
    setBanner({ id: nextBanner.current++, text });
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
    } catch (err) {
      lastLogged.current = logged;
      setProblem((err as Error).message);
    }
    void refresh();
  };

  const fail = (err: unknown) => {
    setPhase('idle');
    setProblem((err as Error).message);
  };

  const submit = async (transcript: string) => {
    const text = transcript.trim();
    if (!text) return;
    setPhase('working');
    setProblem(null);
    try {
      const intents = await ai.parseVoice(text);
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

      if (said) finish(said);
      else setPhase('noMatch');
    } catch (err) {
      if (err instanceof CoachError) {
        setPhase('idle');
        setProblem(err.message);
      } else fail(err);
    }
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
    banner,
    reset,
    submit,
    answer,
    undo,
    clearBanner: () => setBanner(null),
  };
}
