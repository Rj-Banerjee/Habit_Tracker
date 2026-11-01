import { useRef, useState } from 'react';
import { ChatSource, ChatTurn, CoachError } from '@habit-tracker/core';
import { ai } from '../services/ai';

export type Coach = ReturnType<typeof useCoach>;

const FALLBACK = "Coach isn't available right now. Your habits still work as normal.";

export function useCoach() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [replying, setReplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // A state update comes too late to stop a double tap.
  const busy = useRef(false);

  const ask = async (history: ChatTurn[], source: ChatSource) => {
    if (busy.current) return;
    busy.current = true;
    setReplying(true);
    setNotice(null);
    setTurns(history);
    let reply = '';
    try {
      for await (const text of ai.chat(history, source)) {
        reply += text;
        setTurns([...history, { role: 'assistant', text: reply }]);
      }
    } catch (err) {
      setNotice(err instanceof CoachError ? err.message : FALLBACK);
    } finally {
      busy.current = false;
      setReplying(false);
    }
  };

  const send = (text: string, source: ChatSource = 'chat') =>
    ask([...turns, { role: 'user', text }], source);

  // A reply cut off halfway is dropped, so the coach answers the question again.
  const retry = () => {
    const last = turns.findLastIndex((turn) => turn.role === 'user');
    if (last >= 0) void ask(turns.slice(0, last + 1), 'chat');
  };

  return { turns, replying, notice, send, retry };
}
