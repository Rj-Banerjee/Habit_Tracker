import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { addDays, AnalyticsData, AnalyticsDay, AnalyticsHabit } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';
import { HabitDetailScreen } from './HabitDetailScreen';

jest.mock('../services/tracker', () => ({
  tracker: {
    getAnalytics: jest.fn(),
    getDayStatuses: jest.fn(() => Promise.resolve([])),
    getWeekStatuses: jest.fn(() => Promise.resolve([])),
  },
}));

const api = tracker as jest.Mocked<typeof tracker>;
// A Sunday, so the last week is whole.
const TODAY = '2026-11-08';

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
  starts_on: addDays(TODAY, -59),
  ends_on: null,
  reminder_time: '19:00:00',
  time_of_day: 'evening',
  milestone_amount: 300,
  milestone_label: 'book',
  current_streak: 4,
  longest_streak: 9,
};

// 60 days: every Wednesday missed, the rest done at 7:30 pm, one in five at the minimum.
const day = (offset: number): AnalyticsDay => {
  const date = addDays(TODAY, -offset);
  const wednesday = new Date(`${date}T00:00:00Z`).getUTCDay() === 3;
  const minimum = offset % 5 === 0;
  return {
    habit_id: 'h1',
    date,
    status: offset === 0 ? 'pending' : wednesday ? 'missed' : 'done',
    log_status: offset === 0 || wednesday ? null : 'done',
    level_done: offset === 0 || wednesday ? null : minimum ? 'minimum' : 'full',
    amount: offset === 0 || wednesday ? null : minimum ? 5 : 20,
    source: offset === 0 || wednesday ? null : offset % 3 === 0 ? 'voice' : 'tap',
    skip_reason: null,
    target: 20,
    minimum: 5,
    logged_minute: offset === 0 || wednesday ? null : 19 * 60 + 30,
  };
};

const analytics = (from: string, to: string, patch: Partial<AnalyticsData> = {}): AnalyticsData => ({
  from,
  to,
  today: to,
  habits: [read],
  days: Array.from({ length: 60 }, (_, i) => day(59 - i)).filter((d) => d.date >= from),
  weeks: [],
  grace_spent: [],
  ...patch,
});

const open = async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider forced="light">
        <HabitDetailScreen
          habitId="h1"
          title="Read"
          identityName="The Reader"
          today={TODAY}
          onClose={jest.fn()}
          onEdit={jest.fn()}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(async () => {});
};

const tile = (label: string) => screen.getByLabelText(new RegExp(`^${label}: `));

describe('HabitDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getAnalytics.mockImplementation((from, to) => Promise.resolve(analytics(from, to)));
  });

  it('loads a year at once and shows the last 30 days first', async () => {
    await open();
    expect(api.getAnalytics).toHaveBeenCalledWith(addDays(TODAY, -364), TODAY);
    expect(screen.getByText('Read')).toBeTruthy();
    // 30 days back from today: 4 Wednesdays missed, 25 done, today still open.
    expect(tile('Completion').props.accessibilityLabel).toBe('Completion: 86%, 25 of 29 days');
    expect(tile('Current streak').props.accessibilityLabel).toBe('Current streak: 4 days');
    expect(tile('Best streak').props.accessibilityLabel).toBe('Best streak: 9 days');
  });

  it('changes range without loading again', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: '7 days' }));
    expect(tile('Completion').props.accessibilityLabel).toBe('Completion: 83%, 5 of 6 days');
    expect(api.getAnalytics).toHaveBeenCalledTimes(1);
  });

  it('loads the rest of the history only for all time', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'All time' }));
    await act(async () => {});
    expect(api.getAnalytics).toHaveBeenLastCalledWith(addDays(TODAY, -729), TODAY);
    expect(tile('Completion').props.accessibilityLabel).toMatch(/of 59 days$/);
  });

  it('shows the weak weekday and the usual time', async () => {
    await open();
    expect(screen.getByLabelText(/^Wednesday: 0%, 0 of 4/)).toBeTruthy();
    expect(screen.getByLabelText(/^Monday: 100%/)).toBeTruthy();
    expect(screen.getByLabelText(/^When you do it: most often .* at 7pm/)).toBeTruthy();
  });

  it('adds up the amounts, with the forecast', async () => {
    await open();
    expect(tile('Total').props.accessibilityLabel).toMatch(/pages$/);
    expect(tile('Target reached')).toBeTruthy();
    expect(screen.getByText(/in a year/)).toBeTruthy();
  });

  it('draws strength and the bars, which say what a tapped day was', async () => {
    await open();
    expect(screen.getByTestId('strength-line')).toBeTruthy();
    expect(screen.getByLabelText(/^Day by day: 25 of 29 done/)).toBeTruthy();
    expect(screen.getByText('Tap a bar or a ring for its numbers')).toBeTruthy();
  });

  it('measures a times-per-week habit in weeks', async () => {
    const gym = { ...read, id: 'h1', type: 'boolean' as const, unit: null, frequency: 'per_week' as const, per_week: 3 };
    api.getAnalytics.mockResolvedValue(
      analytics(addDays(TODAY, -364), TODAY, {
        habits: [gym],
        days: [],
        weeks: [
          { habit_id: 'h1', week_start: addDays(TODAY, -13), status: 'met', quota: 3, sessions: 3 },
          { habit_id: 'h1', week_start: addDays(TODAY, -6), status: 'missed', quota: 3, sessions: 1 },
        ],
      })
    );
    await open();
    expect(tile('Weeks met').props.accessibilityLabel).toBe('Weeks met: 1, of 2 weeks');
    expect(tile('Current streak').props.accessibilityLabel).toBe('Current streak: 4 weeks');
    expect(screen.getByText('The last 12 weeks')).toBeTruthy();
    expect(screen.queryByText('Amounts')).toBeNull();
  });

  it('teaches what each chart needs when there is nothing yet', async () => {
    api.getAnalytics.mockResolvedValue(analytics(addDays(TODAY, -364), TODAY, { days: [] }));
    await open();
    expect(screen.getByText(/A few days in, its line starts here/)).toBeTruthy();
    expect(screen.getByText(/Log a day to see the first one/)).toBeTruthy();
    expect(screen.getByText(/your usual time shows up here/)).toBeTruthy();
  });

  it('says so when the numbers cannot load', async () => {
    api.getAnalytics.mockRejectedValue(new Error('offline'));
    await open();
    expect(screen.getByText(/The numbers couldn't load/)).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
  });
});
