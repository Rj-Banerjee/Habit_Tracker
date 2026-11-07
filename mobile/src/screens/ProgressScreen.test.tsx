import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { addDays, AnalyticsData, AnalyticsDay, AnalyticsHabit, localDate, ProgressDay } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';
import { ProgressScreen } from './ProgressScreen';

jest.mock('../services/tracker', () => ({
  tracker: {
    getProfile: jest.fn(),
    getAnalytics: jest.fn(),
    getHabitDays: jest.fn(),
    getDayStatuses: jest.fn(() => Promise.resolve([])),
    getWeekStatuses: jest.fn(() => Promise.resolve([])),
  },
}));

const api = tracker as jest.Mocked<typeof tracker>;
const today = localDate('Asia/Kolkata');

const read: AnalyticsHabit = {
  id: 'h1',
  title: 'Read',
  type: 'count',
  unit: 'pages',
  frequency: 'days',
  per_week: null,
  target: 20,
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  identity_id: 'i1',
  identity_name: 'The Reader',
  colour_token: 'identity-1',
  starts_on: addDays(today, -89),
  ends_on: null,
  reminder_time: null,
  time_of_day: 'evening',
  milestone_amount: 300,
  milestone_label: 'book',
  current_streak: 6,
  longest_streak: 12,
};
const run: AnalyticsHabit = {
  ...read,
  id: 'h2',
  title: 'Run',
  type: 'boolean',
  unit: null,
  target: null,
  identity_id: 'i2',
  identity_name: 'The Athlete',
  colour_token: 'identity-2',
  milestone_amount: null,
  milestone_label: null,
  current_streak: 2,
  longest_streak: 4,
};

// 90 days. Read slips one day in three in the older half, one in six lately; Run goes with it,
// and slips one day in five on its own as well.
const status = (habit: string, offset: number) => {
  if (offset === 0) return 'pending';
  const readDone = offset % (offset > 30 ? 3 : 6) !== 0;
  if (habit === 'h1') return readDone ? 'done' : 'missed';
  return readDone && offset % 5 !== 0 ? 'done' : 'missed';
};
const day = (habit: string, offset: number): AnalyticsDay => {
  const done = status(habit, offset) === 'done';
  return {
    habit_id: habit,
    date: addDays(today, -offset),
    status: status(habit, offset),
    log_status: done ? 'done' : null,
    level_done: done ? 'full' : null,
    amount: done && habit === 'h1' ? 20 : null,
    source: done ? 'tap' : null,
    skip_reason: null,
    target: habit === 'h1' ? 20 : null,
    minimum: null,
    logged_minute: done ? 19 * 60 : null,
  };
};
const analytics = (from: string, to: string): AnalyticsData => ({
  from,
  to,
  today: to,
  habits: [read, run],
  days: Array.from({ length: 90 }, (_, i) => 89 - i).flatMap((offset) => [day('h1', offset), day('h2', offset)]),
  weeks: [],
  grace_spent: [],
});

const identityDays: ProgressDay[] = Array.from({ length: 20 }, (_, index) => ({
  habit_id: 'h1',
  date: addDays(today, -1 - index),
  status: index === 3 ? 'missed' : 'done',
  level_done: index === 3 ? null : 'full',
  amount: 20,
  target: 20,
}));

const open = async (active = true) => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider forced="light">
        <ProgressScreen active={active} onOpenReview={jest.fn()} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(async () => {});
};

const tile = (label: string) => screen.getByLabelText(new RegExp(`^${label}: `)).props.accessibilityLabel;

describe('ProgressScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getProfile.mockResolvedValue({
      timezone: 'Asia/Kolkata',
      mode: 'grace',
      onboarded_at: null,
      reminder_time: null,
    });
    api.getAnalytics.mockImplementation((from, to) => Promise.resolve(analytics(from, to)));
    api.getHabitDays.mockResolvedValue(identityDays);
  });

  it('waits until its tab is opened', async () => {
    await open(false);
    expect(api.getAnalytics).not.toHaveBeenCalled();
  });

  it('loads a year and shows the last 30 days, with the trend against the 30 before', async () => {
    await open();
    expect(api.getAnalytics).toHaveBeenCalledWith(addDays(today, -364), today);
    // Read: 25 of 29 done, then Run also skips its own days.
    expect(tile('Completion')).toMatch(/^Completion: \d+%, up from \d+% before$/);
    expect(screen.getByText(/^\d+% ↑$/)).toBeTruthy();
    expect(tile('Best active streak')).toBe('Best active streak: 6 days, Read');
  });

  it('shows what each card was when comparing', async () => {
    await open();
    expect(screen.queryByText(/^was /)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Compare to previous period' }));
    expect(screen.getAllByText(/was \d+/).length).toBeGreaterThanOrEqual(2);
  });

  it('loads two years only for 1 year and all time, which has nothing to compare with', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: '7 days' }));
    expect(api.getAnalytics).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'All time' }));
    await act(async () => {});
    expect(api.getAnalytics).toHaveBeenLastCalledWith(addDays(today, -729), today);
    expect(screen.queryByRole('button', { name: 'Compare to previous period' })).toBeNull();
    expect(tile('Completion')).not.toMatch(/before$/);
  });

  it('ranks habits by strength and opens one', async () => {
    await open();
    const rows = screen.getAllByLabelText(/^\d\. .*: strength \d+/);
    expect(rows.map((r) => r.props.accessibilityLabel.split(':')[0])).toEqual(['1. Read', '2. Run']);
    await fireEvent.press(rows[1]);
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Edit habit' })).toBeTruthy();
    expect(api.getAnalytics).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('button', { name: 'Edit habit' })).toBeNull();
  });

  it('draws the days, with each week', async () => {
    await open();
    expect(screen.getByLabelText(/^Day by day: \d+ of \d+ done over \d+ weeks\./)).toBeTruthy();
  });

  it('shows the identity score as days out of days', async () => {
    await open();
    expect(screen.getByText('19 of 20 days')).toBeTruthy();
  });

  it('says which habits go together', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: '90 days' }));
    expect(screen.getByText(/^When you do Read, you do Run \d+% of the time/)).toBeTruthy();
  });

  it('never calls a miss a failure', async () => {
    await open();
    expect(screen.queryByText(/fail|broken|lost/i)).toBeNull();
  });

  it('offers a retry when loading fails', async () => {
    api.getAnalytics.mockRejectedValueOnce(new Error('offline'));
    await open();
    expect(screen.getByText("Your progress couldn't load.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => {});
    expect(screen.getByText('19 of 20 days')).toBeTruthy();
  });

  it('points to adding a habit when there are none', async () => {
    api.getAnalytics.mockImplementation((from, to) => Promise.resolve({ ...analytics(from, to), habits: [], days: [] }));
    await open();
    expect(screen.getByText('Add a habit, and your progress will show up here.')).toBeTruthy();
  });
});
