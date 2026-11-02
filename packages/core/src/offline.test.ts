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

  it('leaves a different day alone', () => {
    const rows = [{ habit_id: 'a', day: '2026-11-02', status: 'pending' }] as TodayRow[];
    expect(withQueued(rows, [log('a')])[0].status).toBe('pending');
  });
});

describe('flushQueue', () => {
  it('sends everything, in order', async () => {
    const logHabit = vi.fn(async () => null);
    const result = await flushQueue({ logHabit }, [log('a'), log('b')], isOffline);
    expect(result).toEqual({ remaining: [], dropped: 0 });
    expect(logHabit.mock.calls.map((call: unknown[]) => call[0])).toEqual(['a', 'b']);
  });

  it('keeps the rest when the connection drops again', async () => {
    const logHabit = vi.fn(async () => null).mockRejectedValueOnce(offline);
    const result = await flushQueue({ logHabit }, [log('a'), log('b')], isOffline);
    expect(result.remaining).toHaveLength(2);
    expect(logHabit).toHaveBeenCalledTimes(1);
  });

  it('drops a log the server refuses, and carries on', async () => {
    const logHabit = vi.fn(async () => null).mockRejectedValueOnce(new Error('window closed'));
    const result = await flushQueue({ logHabit }, [log('a'), log('b')], isOffline);
    expect(result).toEqual({ remaining: [], dropped: 1 });
    expect(logHabit).toHaveBeenCalledTimes(2);
  });

  it('counts in plain words', () => {
    expect(droppedNote(1)).toContain('A log');
    expect(droppedNote(2)).toContain('2 logs');
  });
});
