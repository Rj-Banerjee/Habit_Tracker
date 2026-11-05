import { describe, expect, it, vi } from 'vitest';
import { TodayRow } from './api';
import { addToQueue, droppedNote, flushQueue, QueuedLog, removeFromQueue, withQueued } from './offline';

const log = (habitId: string, date = '2026-11-03', patch: Partial<QueuedLog> = {}): QueuedLog => ({
  habitId,
  date,
  level: 'full',
  amount: null,
  source: 'tap',
  ...patch,
});

const offline = new Error('offline');
const isOffline = (error: unknown) => error === offline;

const api = () => ({
  logHabit: vi.fn(async () => null),
  skipHabit: vi.fn(async () => null),
  repairHabit: vi.fn(async () => null),
});

describe('the queue', () => {
  it('keeps the latest log for a day', () => {
    const queue = addToQueue([log('a')], log('a', '2026-11-03', { level: 'minimum' }));
    expect(queue).toHaveLength(1);
    expect(queue[0].level).toBe('minimum');
  });

  it('keeps other days and habits', () => {
    expect(addToQueue([log('a'), log('b')], log('a', '2026-11-02'))).toHaveLength(3);
  });

  it('removes one log', () => {
    expect(removeFromQueue([log('a'), log('b')], 'a', '2026-11-03')).toEqual([log('b')]);
  });

  it('shows a queued log as done', () => {
    const rows = [{ habit_id: 'a', day: '2026-11-03', status: 'pending' }] as TodayRow[];
    expect(withQueued(rows, [log('a', '2026-11-03', { amount: 5 })])[0]).toMatchObject({
      status: 'done',
      level_done: 'full',
      amount: 5,
    });
  });

  it('shows a queued skip as skipped, with its reason', () => {
    const rows = [{ habit_id: 'a', day: '2026-11-03', status: 'pending' }] as TodayRow[];
    expect(withQueued(rows, [log('a', '2026-11-03', { kind: 'skip', reason: 'sick' })])[0]).toMatchObject({
      status: 'skipped',
      level_done: null,
      skip_reason: 'sick',
    });
  });

  it('shows a queued repair as done', () => {
    const rows = [{ habit_id: 'a', day: '2026-11-03', status: 'missed' }] as TodayRow[];
    expect(withQueued(rows, [log('a', '2026-11-03', { kind: 'repair', amount: 8 })])[0]).toMatchObject({
      status: 'done',
      amount: 8,
    });
  });

  it('lets a later log replace a queued skip for the same day', () => {
    const queue = addToQueue([log('a', '2026-11-03', { kind: 'skip', reason: 'sick' })], log('a'));
    expect(queue).toEqual([log('a')]);
  });

  it('leaves a different day alone', () => {
    const rows = [{ habit_id: 'a', day: '2026-11-02', status: 'pending' }] as TodayRow[];
    expect(withQueued(rows, [log('a')])[0].status).toBe('pending');
  });
});

describe('flushQueue', () => {
  it('sends everything, in order', async () => {
    const tracker = api();
    const result = await flushQueue(tracker, [log('a'), log('b')], isOffline);
    expect(result).toEqual({ remaining: [], dropped: 0 });
    expect(tracker.logHabit.mock.calls.map((call: unknown[]) => call[0])).toEqual(['a', 'b']);
  });

  it('keeps the rest when the connection drops again', async () => {
    const tracker = api();
    tracker.logHabit.mockRejectedValueOnce(offline);
    const result = await flushQueue(tracker, [log('a'), log('b')], isOffline);
    expect(result.remaining).toHaveLength(2);
    expect(tracker.logHabit).toHaveBeenCalledTimes(1);
  });

  it('drops a log the server refuses, and carries on', async () => {
    const tracker = api();
    tracker.logHabit.mockRejectedValueOnce(new Error('window closed'));
    const result = await flushQueue(tracker, [log('a'), log('b')], isOffline);
    expect(result).toEqual({ remaining: [], dropped: 1 });
    expect(tracker.logHabit).toHaveBeenCalledTimes(2);
  });

  it('sends a skip with its reason and source, and a repair with its amount', async () => {
    const tracker = api();
    await flushQueue(
      tracker,
      [
        log('a', '2026-11-03', { kind: 'skip', reason: 'sick', source: 'voice' }),
        log('b', '2026-11-02', { kind: 'repair', amount: 8 }),
      ],
      isOffline
    );
    expect(tracker.skipHabit).toHaveBeenCalledWith('a', '2026-11-03', 'sick', 'voice');
    expect(tracker.repairHabit).toHaveBeenCalledWith('b', '2026-11-02', 8);
    expect(tracker.logHabit).not.toHaveBeenCalled();
  });

  it('drops a repair the server refuses once its day has passed', async () => {
    const tracker = api();
    tracker.repairHabit.mockRejectedValueOnce(new Error('This day can no longer be repaired'));
    const result = await flushQueue(tracker, [log('b', '2026-11-02', { kind: 'repair', amount: 8 })], isOffline);
    expect(result).toEqual({ remaining: [], dropped: 1 });
  });

  it('sends a queue saved before kinds existed as logs', async () => {
    const tracker = api();
    await flushQueue(tracker, [log('a')], isOffline);
    expect(tracker.logHabit).toHaveBeenCalledWith('a', '2026-11-03', 'full', null, 'tap');
  });

  it('counts in plain words', () => {
    expect(droppedNote(1)).toContain('A log');
    expect(droppedNote(2)).toContain('2 logs');
  });
});
