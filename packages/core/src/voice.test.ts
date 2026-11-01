import { describe, expect, it, vi } from 'vitest';
import { TodayRow } from './api';
import { VoiceQuestion } from './ai';
import { answerWhich, isVoiceAction, runVoiceAction, whichQuestion } from './voice';

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
