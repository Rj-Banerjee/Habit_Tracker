import { useRef, useState } from 'react';
import {
  answerWhich,
  ChatSource,
  ChatTurn,
  CoachError,
  describeIntents,
  isVoiceAction,
  MissReason,
  noHabitMessage,
  VoiceIntent,
  VoiceOption,
  VoiceParse,
  VoiceQuestion,
  whichQuestion,
} from '@habit-tracker/core';
import { analytics } from '../services/analytics';
import { ai } from '../services/ai';
import { Actions } from './useActions';

export type Coach = ReturnType<typeof useCoach>;

const FALLBACK = "Coach isn't available right now. Your habits still work as normal.";

// The choices under the coach's latest message.
export type CoachOffer =
  | { kind: 'undo' }
  | { kind: 'confirm'; intents: VoiceIntent[] }
  | { kind: 'which'; question: VoiceQuestion }
  | { kind: 'create'; name: string };

export function useCoach(actions: Actions) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [replying, setReplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(true);
  const [offer, setOffer] = useState<CoachOffer | null>(null);
  // A state update comes too late to stop a double tap.
  const busy = useRef(false);

  const say = (history: ChatTurn[], text: string) =>
    setTurns([...history, { role: 'assistant', text }]);

  const act = async (history: ChatTurn[], intents: VoiceIntent[]) => {
    const which = intents.find((intent) => intent.intent === 'ask_which');
    const steps = intents.filter(isVoiceAction);
    const parts: string[] = [];
    let canUndo = false;

    if (steps.length > 0) {
      const done = await actions.run(steps, 'coach');
      parts.push(done.say);
      canUndo = done.canUndo;
    }
    if (intents.some((intent) => intent.intent === 'undo_last')) {
      parts.push(await actions.undoLast('coach'));
    }
    if (which) {
      parts.push(whichQuestion(which));
      setOffer({ kind: 'which', question: which });
    } else if (canUndo) {
      setOffer({ kind: 'undo' });
    }
    say(history, parts.join(' '));
  };

  const decide = async (history: ChatTurn[], decision: VoiceParse) => {
    if (decision.level === 'no_habit') {
      say(history, noHabitMessage(decision.missing_habit ?? ''));
      setOffer({ kind: 'create', name: decision.missing_habit ?? '' });
    } else if (decision.level === 'medium') {
      say(history, `Did you mean: ${describeIntents(decision.intents)}?`);
      setOffer({ kind: 'confirm', intents: decision.intents });
    } else {
      await act(history, decision.intents);
    }
  };

  // Everything here is the same guard and the same calm failure.
  const guarded = async (work: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setReplying(true);
    setNotice(null);
    setOffer(null);
    try {
      await work();
    } catch (err) {
      analytics.track('coach_reply', { outcome: err instanceof CoachError ? (err.code as 'busy') : 'unavailable' });
      setNotice(err instanceof CoachError || err instanceof Error ? friendly(err) : FALLBACK);
      setCanRetry(!(err instanceof CoachError && err.code === 'test_only'));
    } finally {
      busy.current = false;
      setReplying(false);
    }
  };

  const ask = (history: ChatTurn[], source: ChatSource, reason?: MissReason) =>
    guarded(async () => {
      setTurns(history);
      let reply = '';
      analytics.track('coach_message_sent', { from: source });
      for await (const event of ai.chat(history, source, reason)) {
        if (event.type === 'actions') {
          await decide(history, event);
        } else {
          reply += event.text;
          say(history, reply);
        }
      }
      analytics.track('coach_reply', { outcome: 'replied' });
    });

  const send = (text: string, source: ChatSource = 'chat', reason?: MissReason) =>
    ask([...turns, { role: 'user', text }], source, reason);

  // A reply cut off halfway is dropped, so the coach answers the question again.
  const retry = () => {
    const last = turns.findLastIndex((turn) => turn.role === 'user');
    if (last >= 0) void ask(turns.slice(0, last + 1), 'chat');
  };

  const confirm = (intents: VoiceIntent[]) => guarded(() => act(turns, intents));

  const reject = () => {
    setOffer(null);
    say(turns, 'No problem. Tell me what you meant.');
  };

  const answer = (question: VoiceQuestion, option: VoiceOption) =>
    guarded(() => act(turns, [answerWhich(question, option)]));

  const undo = () =>
    guarded(async () => {
      say(turns, await actions.undoLast('coach'));
    });

  return { turns, replying, notice, canRetry, offer, send, retry, confirm, reject, answer, undo };
}

// A rule the server refuses is worth showing. A stream that broke isn't.
function friendly(err: Error) {
  return err instanceof CoachError || err.message.startsWith('That ') ? err.message : FALLBACK;
}
