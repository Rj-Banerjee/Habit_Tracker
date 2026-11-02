import { useEffect, useState } from 'react';
import {
  addDays,
  CoachError,
  FutureLetter,
  localDate,
  ProgressHabit,
  ProgressDay,
  Reflection,
  reviewWeekStart,
  weekLabel,
  weekSummary,
} from '@habit-tracker/core';
import { ai } from '../services/ai';
import { tracker } from '../services/tracker';

const BLANK_WINS = ['', '', ''];
const FALLBACK = "Coach isn't available right now. Your habits still work as normal.";

export function useSundayReview(userId: string) {
  const [start, setStart] = useState('');
  const [habits, setHabits] = useState<ProgressHabit[]>([]);
  const [days, setDays] = useState<ProgressDay[]>([]);
  const [wins, setWins] = useState(BLANK_WINS);
  const [mood, setMood] = useState('');
  const [status, setStatus] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [letter, setLetter] = useState('');
  const [writing, setWriting] = useState(false);
  const [letterProblem, setLetterProblem] = useState<string | null>(null);

  useEffect(() => {
    tracker
      .getProfile()
      .then(async ({ timezone }) => {
        const monday = reviewWeekStart(localDate(timezone));
        const [list, week, reflection, latest] = await Promise.all([
          tracker.listProgressHabits(),
          tracker.getHabitDays(monday, addDays(monday, 6)),
          tracker.getReflection(monday),
          tracker.getLatestLetter().catch((): FutureLetter | null => null),
        ]);
        setStart(monday);
        setHabits(list);
        setDays(week);
        if (reflection) {
          setWins(BLANK_WINS.map((_, index) => reflection.wins[index] ?? ''));
          setMood(reflection.mood_line ?? '');
        }
        if (latest?.week_start === monday) setLetter(latest.text);
        setStatus('ready');
      })
      .catch(() => setStatus('failed'));
  }, [attempt]);

  const retry = () => {
    setStatus('loading');
    setAttempt((count) => count + 1);
  };

  const filledWins = () => wins.map((win) => win.trim()).filter(Boolean);

  const setWin = (index: number, text: string) => {
    setWins((current) => current.map((win, at) => (at === index ? text : win)));
    setSaved(false);
  };

  const editMood = (text: string) => {
    setMood(text);
    setSaved(false);
  };

  const save = async () => {
    const reflection: Reflection = {
      week_start: start,
      wins: filledWins(),
      mood_line: mood.trim() || null,
      month_note: null,
    };
    setSaving(true);
    setProblem(null);
    try {
      await tracker.saveReflection(userId, reflection);
      setSaved(true);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const writeLetter = async () => {
    setWriting(true);
    setLetterProblem(null);
    setLetter('');
    try {
      let text = '';
      for await (const event of ai.letter(start, filledWins(), mood.trim() || null)) {
        if (event.type === 'text') {
          text += event.text;
          setLetter(text);
        }
      }
    } catch (err) {
      setLetterProblem(err instanceof CoachError ? err.message : FALLBACK);
    } finally {
      setWriting(false);
    }
  };

  return {
    status,
    retry,
    label: start ? weekLabel(start) : '',
    // Nothing to count until the week has loaded.
    week: start ? weekSummary(habits, days, start) : [],
    wins,
    setWin,
    mood,
    editMood,
    save,
    saved,
    saving,
    problem,
    letter,
    writing,
    letterProblem,
    writeLetter,
  };
}
