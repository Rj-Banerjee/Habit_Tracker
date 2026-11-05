import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, useRightClickGuard } from '@habit-tracker/ui';
import { DayActionsSheet } from './DayActionsSheet';
import { DayCell } from './DayCell';
import { MonthGrid } from './MonthGrid';

const live = vi.hoisted(() => ({ watch: vi.fn(() => () => {}) }));
const api = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listHabitsInRange: vi.fn(),
  getDayStatuses: vi.fn(),
  getStreaks: vi.fn(),
  logHabit: vi.fn(),
  undoLog: vi.fn(),
  skipHabit: vi.fn(),
}));

vi.mock('../../services/tracker', () => ({ tracker: api }));
vi.mock('../../services/live', () => ({ watchMyActivity: live.watch }));

const NOW = new Date('2026-11-10T12:00:00Z');

const habit = {
  id: 'h1',
  identity_id: 'i1',
  title: 'Run',
  identities: { name: 'The Athlete', colour_token: 'identity-1' },
  habit_levels: [
    { level: 'minimum', description: 'Run 1 km', target: null },
    { level: 'full', description: 'Run 5 km', target: null },
  ],
  habit_logs: [{ id: 'l1', habit_id: 'h1', date: '2026-11-02', status: 'done', level_done: 'minimum' }],
};

const statuses = [
  { habit_id: 'h1', date: '2026-11-01', status: 'unscheduled', repair_on: null },
  { habit_id: 'h1', date: '2026-11-02', status: 'done', repair_on: null },
  { habit_id: 'h1', date: '2026-11-03', status: 'missed', repair_on: '2026-11-12' },
  { habit_id: 'h1', date: '2026-11-04', status: 'skipped', repair_on: null },
  { habit_id: 'h1', date: '2026-11-05', status: 'protected', repair_on: null },
  { habit_id: 'h1', date: '2026-11-06', status: 'repaired', repair_on: null },
  { habit_id: 'h1', date: '2026-11-07', status: 'missed', repair_on: null },
  { habit_id: 'h1', date: '2026-11-09', status: 'pending', repair_on: null },
  { habit_id: 'h1', date: '2026-11-10', status: 'pending', repair_on: null },
  { habit_id: 'h1', date: '2026-11-11', status: 'pending', repair_on: null },
];

const open = async () => {
  render(
    <ThemeProvider forced="light">
      <MonthGrid />
    </ThemeProvider>
  );
  await screen.findByText('Run');
};

describe('MonthGrid', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    api.getProfile.mockResolvedValue({ timezone: 'UTC', mode: 'grace' });
    api.listHabitsInRange.mockResolvedValue([habit]);
    api.getDayStatuses.mockResolvedValue(statuses);
    api.getStreaks.mockResolvedValue([
      { habit_id: 'h1', current_streak: 12, longest_streak: 12, today_status: 'pending' },
    ]);
    api.logHabit.mockResolvedValue(null);
    api.undoLog.mockResolvedValue(null);
    api.skipHabit.mockResolvedValue(null);
  });

  it('draws every day state with no console errors', async () => {
    const errors = vi.spyOn(console, 'error');
    await open();
    for (const label of [
      'Run, Mon, 2 Nov, Done, minimum version',
      'Run, Tue, 3 Nov, Repair on Thu',
      'Run, Wed, 4 Nov, Skipped',
      'Run, Thu, 5 Nov, Protected by a Grace Day',
      'Run, Fri, 6 Nov, Repaired',
      'Run, Sat, 7 Nov, Not done',
      'Run, Mon, 9 Nov, Not logged yet',
      'Run, Tue, 10 Nov, Due today',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it('draws nothing to click on unscheduled or future days', async () => {
    await open();
    expect(screen.queryByRole('button', { name: /1 Nov/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /11 Nov/ })).toBeNull();
  });

  it('groups habits under their identity and shows the streak', async () => {
    await open();
    expect(screen.getByText('The Athlete')).toBeTruthy();
    // Once as the 12th in the header, and once as the streak.
    expect(screen.getAllByText('12')).toHaveLength(2);
  });

  it('shows a log made on the phone without a reload', async () => {
    await open();
    api.getDayStatuses.mockResolvedValue(
      statuses.map((s) => (s.date === '2026-11-10' ? { ...s, status: 'done' } : s))
    );
    api.listHabitsInRange.mockResolvedValue([
      {
        ...habit,
        habit_logs: [
          ...habit.habit_logs,
          { id: 'l2', habit_id: 'h1', date: '2026-11-10', status: 'done', level_done: 'full' },
        ],
      },
    ]);
    const [onChange] = live.watch.mock.calls.at(-1) as unknown as [() => void];
    await act(async () => onChange());
    expect(await screen.findByRole('button', { name: 'Run, Tue, 10 Nov, Done' })).toBeTruthy();
  });

  it('logs with a click and undoes with another', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /10 Nov, Due today/ }));
    await waitFor(() => expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-10', 'full'));
    api.getDayStatuses.mockResolvedValue(
      statuses.map((s) => (s.date === '2026-11-09' ? { ...s, status: 'done' } : s))
    );
    fireEvent.click(screen.getByRole('button', { name: /9 Nov, Not logged yet/ }));
    await waitFor(() => expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-09', 'full'));
  });

  it('leaves days past the back-log window inactive', async () => {
    await open();
    const closed = screen.getByRole('button', { name: /7 Nov, Not done/ });
    expect(closed.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(closed);
    expect(api.logHabit).not.toHaveBeenCalled();
    fireEvent.contextMenu(closed);
    expect(screen.queryByText('Skip this day')).toBeNull();
  });

  it('puts a refused log back and explains why', async () => {
    api.logHabit.mockRejectedValue(new Error('The back-log window for that day has closed'));
    await open();
    fireEvent.click(screen.getByRole('button', { name: /9 Nov, Not logged yet/ }));
    expect(await screen.findByText('The back-log window for that day has closed')).toBeTruthy();
    expect(screen.getByRole('button', { name: /9 Nov, Not logged yet/ })).toBeTruthy();
  });

  it('changes month with the keyboard, and returns to this month', async () => {
    await open();
    fireEvent.keyDown(window, { key: ']' });
    expect(await screen.findByText('December 2026')).toBeTruthy();
    fireEvent.keyDown(window, { key: 't' });
    expect(await screen.findByText('November 2026')).toBeTruthy();
  });

  it('offers a retry instead of an empty grid when loading fails', async () => {
    api.getDayStatuses.mockRejectedValue(new Error('offline'));
    render(
      <ThemeProvider forced="light">
        <MonthGrid />
      </ThemeProvider>
    );
    expect(await screen.findByText("Your habits couldn't load.")).toBeTruthy();
  });

  it('explains an empty account', async () => {
    api.listHabitsInRange.mockResolvedValue([]);
    api.getDayStatuses.mockResolvedValue([]);
    render(
      <ThemeProvider forced="light">
        <MonthGrid />
      </ThemeProvider>
    );
    expect(await screen.findByText('No habits yet.')).toBeTruthy();
  });
});

describe('DayCell', () => {
  it('opens the actions on right click', async () => {
    const onActions = vi.fn();
    render(
      <ThemeProvider forced="light">
        <DayCell
          title="Run"
          date="2026-11-10"
          size={36}
          status="due"
          identity="identity-1"
          isToday
          repairOn={null}
          editable
          onPress={() => {}}
          onActions={onActions}
        />
      </ThemeProvider>
    );
    await act(async () => {
      fireEvent.contextMenu(screen.getByRole('button'));
    });
    expect(onActions).toHaveBeenCalledTimes(1);
  });
});

describe('useRightClickGuard', () => {
  it('stops a right button release from reaching the page, and leaves left clicks alone', () => {
    const seen: number[] = [];
    const listen = (event: MouseEvent) => seen.push(event.button);
    document.addEventListener('mouseup', listen, true);
    const { unmount } = renderHook(() => useRightClickGuard());
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 }));
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    unmount();
    document.removeEventListener('mouseup', listen, true);
    expect(seen).toEqual([0]);
  });
});

describe('DayActionsSheet', () => {
  const sheet = (logged: boolean, handlers = {}) =>
    render(
      <ThemeProvider forced="light">
        <DayActionsSheet
          target={{ habit: habit as never, date: '2026-11-10', logged, repairOn: null }}
          onClose={() => {}}
          onLog={() => {}}
          onUndo={() => {}}
          onSkip={() => {}}
          {...handlers}
        />
      </ThemeProvider>
    );

  it('lists the ladder from full to minimum', () => {
    sheet(false);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names.indexOf('Full version, Run 5 km')).toBeLessThan(
      names.indexOf('Minimum version, Run 1 km')
    );
  });

  it('skips with a reason', async () => {
    const onSkip = vi.fn();
    sheet(false, { onSkip });
    fireEvent.click(screen.getByRole('button', { name: 'Skip this day' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sick' }));
    expect(onSkip.mock.calls[0][1]).toBe('Sick');
  });

  it('offers undo once logged', () => {
    sheet(true);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip this day' })).toBeNull();
  });
});
