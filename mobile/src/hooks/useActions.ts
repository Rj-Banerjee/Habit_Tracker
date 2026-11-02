import { useRef } from 'react';
import {
  LogSource,
  runVoiceActions,
  TodayRow,
  undoActions,
  VoiceAction,
  VoiceUndo,
} from '@habit-tracker/core';
import { tracker } from '../services/tracker';

export type Actions = ReturnType<typeof useActions>;

// Voice and the coach share this, so "undo that" means the same in both.
export function useActions(rows: TodayRow[], refresh: () => Promise<unknown>) {
  const lastLogged = useRef<VoiceUndo[]>([]);

  const run = async (actions: VoiceAction[], source: LogSource) => {
    const { say, undos } = await runVoiceActions(tracker, actions, rows, source);
    if (undos.length > 0) lastLogged.current = undos;
    void refresh();
    return { say, canUndo: undos.length > 0 };
  };

  // Keeps the list if it fails, so the undo can be tried again.
  const undoLast = async (source: LogSource) => {
    const logged = lastLogged.current;
    if (logged.length === 0) return 'Nothing to undo.';
    await undoActions(tracker, logged, source);
    lastLogged.current = [];
    void refresh();
    return 'Undone.';
  };

  return { run, undoLast };
}
