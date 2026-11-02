import { describe, expect, it, vi } from 'vitest';
import { TodayRow } from './api';
import { toggleFromWidget, widgetModel } from './widget';

const row = (id: string, status = 'pending', patch: Partial<TodayRow> = {}) =>
  ({
    habit_id: id,
    title: id,
    status,
    level_done: status === 'done' ? 'full' : null,
    is_today: true,
    day: '2026-11-02',
    colour_token: 'identity-1',
    target: null,
    levels: [],
    ...patch,
  }) as TodayRow;

const api = () => ({ logHabit: vi.fn(async () => null), undoLog: vi.fn(async () => null) });

describe('widgetModel', () => {
  it('puts open habits first', () => {
    const model = widgetModel([row('a', 'done'), row('b')]);
    expect(model.items.map((item) => item.habitId)).toEqual(['b', 'a']);
    expect(model.items[1].done).toBe(true);
  });

  it('leaves out yesterday', () => {
    expect(widgetModel([row('a', 'pending', { is_today: false })]).items).toEqual([]);
  });

  it('says how many did not fit', () => {
    const model = widgetModel(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => row(id)));
    expect(model.items).toHaveLength(4);
    expect(model.more).toBe(2);
  });

  it('copes with nothing due', () => {
    expect(widgetModel([])).toEqual({ summary: 'Today', items: [], more: 0 });
  });
});

describe('toggleFromWidget', () => {
  it('logs the full version as a widget log', async () => {
    const tracker = api();
    await toggleFromWidget(tracker, [row('a', 'pending', { target: 30 })], 'a');
    expect(tracker.logHabit).toHaveBeenCalledWith('a', '2026-11-02', 'full', 30, 'widget');
  });

  it('takes back a logged habit', async () => {
    const tracker = api();
    await toggleFromWidget(tracker, [row('a', 'done')], 'a');
    expect(tracker.undoLog).toHaveBeenCalledWith('a', '2026-11-02', 'widget');
  });

  it("does nothing for a habit that isn't on today", async () => {
    const tracker = api();
    await toggleFromWidget(tracker, [], 'a');
    expect(tracker.logHabit).not.toHaveBeenCalled();
  });
});
