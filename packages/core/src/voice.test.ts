import { describe, expect, it, vi } from 'vitest';
import { TodayRow } from './api';
import { VoiceQuestion } from './ai';
import {
  answerWhich,
  describeIntents,
  heardLine,
  isUndoPhrase,
  isVoiceAction,
  noHabitMessage,
  OFF_TOPIC_MESSAGE,
  runVoiceAction,
  runVoiceActions,
  undoActions,
  whichQuestion,
} from './voice';

const row = (patch: Partial<TodayRow> = {}) =>
  ({
    day: '2026-11-02',
    is_today: true,
    habit_id: 'h1',
    title: 'Read',
    target: 30,
    unit: 'pages',
    current_streak: 4,
    status: 'pending',
    levels: [
      { level: 'full', description: 'All', target: 30 },
      { level: 'minimum', description: 'Some', target: 1 },
    ],
    ...patch,
  }) as TodayRow;

const api = (rows: TodayRow[]) => ({
  logHabit: vi.fn(async () => null),
  skipHabit: vi.fn(async () => null),
  undoLog: vi.fn(async () => null),
  getToday: vi.fn(async () => rows),
});

const read = { habit_id: 'h1', habit_title: 'Read' };
const question: VoiceQuestion = {
  intent: 'ask_which',
  action: 'log_habit',
  options: [read, { habit_id: 'h2', habit_title: 'Run' }],
};

describe('runVoiceAction', () => {
  it('logs in full, marks it as voice, and gives the streak', async () => {
    const tracker = api([row({ current_streak: 5 })]);
    const done = await runVoiceAction(tracker, { intent: 'log_habit', ...read }, [row()]);
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', 30, 'voice');
    expect(done.say).toBe('Logged Read. 5-day streak.');
    expect(done.undo).toEqual({ habitId: 'h1', date: '2026-11-02' });
  });

  it('leaves out a streak of one', async () => {
    const done = await runVoiceAction(api([row({ current_streak: 1 })]), { intent: 'log_habit', ...read }, [row()]);
    expect(done.say).toBe('Logged Read.');
  });

  it('logs the minimum', async () => {
    const tracker = api([row({ current_streak: 5 })]);
    const done = await runVoiceAction(tracker, { intent: 'shrink_habit', ...read }, [row()]);
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'minimum', 1, 'voice');
    expect(done.say).toContain('Logged the minimum for Read.');
  });

  it('logs an amount, as the minimum when it falls short of the target', async () => {
    const tracker = api([row()]);
    const done = await runVoiceAction(tracker, { intent: 'log_amount', ...read, amount: 20 }, [row()]);
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'minimum', 20, 'voice');
    expect(done.say).toContain('Logged 20 pages of Read.');
  });

  it('logs an amount that meets the target in full', async () => {
    const tracker = api([row()]);
    await runVoiceAction(tracker, { intent: 'log_amount', ...read, amount: 30 }, [row()]);
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', 30, 'voice');
  });

  it('skips, filling in a reason because the server needs one', async () => {
    const tracker = api([row()]);
    const done = await runVoiceAction(tracker, { intent: 'skip_habit', ...read, reason: ' ' }, [row()]);
    expect(tracker.skipHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'Not today', 'voice');
    expect(done.say).toBe('Skipped Read.');
  });

  it("prefers today's row over yesterday's", async () => {
    const tracker = api([row()]);
    const rows = [row({ day: '2026-11-01', is_today: false }), row()];
    await runVoiceAction(tracker, { intent: 'log_habit', ...read }, rows);
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', 30, 'voice');
  });

  it("leaves the date to the server for a habit that isn't on Today", async () => {
    const tracker = api([]);
    await runVoiceAction(tracker, { intent: 'log_habit', ...read }, []);
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', null, 'full', null, 'voice');
  });
});

describe('undo a named habit', () => {
  const done = row({ status: 'done', level_done: 'full' });

  it("undoes that habit's log today", async () => {
    const tracker = api([done]);
    const result = await runVoiceAction(tracker, { intent: 'undo_habit', ...read }, [done]);
    expect(tracker.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'voice');
    expect(result.say).toBe('Undid Read.');
    expect(result.undo).toBeNull();
  });

  it('says so when it has no log today', async () => {
    const tracker = api([row()]);
    const result = await runVoiceAction(tracker, { intent: 'undo_habit', ...read }, [row()]);
    expect(tracker.undoLog).not.toHaveBeenCalled();
    expect(result.say).toBe("Read isn't logged today.");
  });

  it('says so for a habit not on Today', async () => {
    const result = await runVoiceAction(api([]), { intent: 'undo_habit', ...read }, []);
    expect(result.say).toBe("Read isn't logged today.");
  });

  it('can be confirmed by name', () => {
    expect(describeIntents([{ intent: 'undo_habit', ...read }])).toBe('Undo Read');
  });
});

describe('shared action code', () => {
  it('marks where a log came from', async () => {
    const tracker = api([row()]);
    await runVoiceAction(tracker, { intent: 'log_habit', ...read }, [row()], 'coach');
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', 30, 'coach');
    await runVoiceAction(tracker, { intent: 'skip_habit', ...read, reason: 'Sick' }, [row()], 'coach');
    expect(tracker.skipHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'Sick', 'coach');
  });

  it('marks a coach undo too', async () => {
    const tracker = api([]);
    await undoActions(tracker, [{ habitId: 'h1', date: '2026-11-02' }], 'coach');
    expect(tracker.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'coach');
  });

  it('collects what can be undone, and joins the words', async () => {
    const tracker = api([row({ current_streak: 1 })]);
    const done = await runVoiceActions(
      tracker,
      [
        { intent: 'log_habit', ...read },
        { intent: 'undo_habit', habit_id: 'h9', habit_title: 'Run' },
      ],
      [row()],
      'coach'
    );
    expect(done.say).toBe("Logged Read. Run isn't logged today.");
    expect(done.undos).toHaveLength(1);
  });
});

describe('messages', () => {
  it('shows a correction only when there was one', () => {
    expect(heardLine('I read', 'I read', [])).toBe('Heard: I read');
    expect(heardLine('undi the read', 'undo the read', [{ intent: 'undo_habit', ...read }])).toBe(
      'Heard: undi the read → understood as: Undo Read'
    );
  });

  it('names a missing habit', () => {
    expect(noHabitMessage('Yoga')).toBe("You don't have a habit called Yoga.");
  });

  it('gives an example when it is off topic', () => {
    expect(OFF_TOPIC_MESSAGE).toContain('I read 20 pages');
  });
});

describe('describeIntents', () => {
  it('says what it would do', () => {
    expect(describeIntents([{ intent: 'undo_last' }])).toBe('Undo the last log');
    expect(describeIntents([{ intent: 'log_amount', ...read, amount: 20 }])).toBe('Log 20 of Read');
    expect(describeIntents([{ intent: 'shrink_habit', ...read }])).toBe('Log the minimum for Read');
    expect(describeIntents([{ intent: 'skip_habit', ...read, reason: '' }])).toBe('Skip Read');
  });

  it('joins several', () => {
    expect(
      describeIntents([
        { intent: 'log_habit', ...read },
        { intent: 'log_habit', habit_id: 'h2', habit_title: 'Run' },
      ])
    ).toBe('Log Read and Log Run');
  });
});

describe('isUndoPhrase', () => {
  it.each(['undo', 'Undo that', 'undo that.', 'undo it', 'take that back', 'please undo that'])(
    'hears %s',
    (text) => expect(isUndoPhrase(text)).toBe(true)
  );

  it.each(['undo my run and log my walk', 'I read', 'undone', ''])('leaves %s to the parser', (text) =>
    expect(isUndoPhrase(text)).toBe(false)
  );
});

describe('which one', () => {
  it('asks in plain words', () => {
    expect(whichQuestion(question)).toBe('Read or Run?');
  });

  it('turns the answer into the action they wanted', () => {
    expect(answerWhich(question, read)).toEqual({ intent: 'log_habit', ...read });
    expect(answerWhich({ ...question, action: 'log_amount', amount: 5 }, read)).toEqual({
      intent: 'log_amount',
      ...read,
      amount: 5,
    });
    expect(answerWhich({ ...question, action: 'skip_habit', reason: 'Sick' }, read)).toEqual({
      intent: 'skip_habit',
      ...read,
      reason: 'Sick',
    });
  });

  it('knows an action from the rest', () => {
    expect(isVoiceAction({ intent: 'log_habit', ...read })).toBe(true);
    expect(isVoiceAction({ intent: 'undo_last' })).toBe(false);
    expect(isVoiceAction(question)).toBe(false);
  });
});
