import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { addDays, localDate, ProgressDay, ProgressHabit } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';
import { ProgressScreen } from './ProgressScreen';

jest.mock('../services/tracker', () => ({
  tracker: {
    getProfile: jest.fn(),
    listProgressHabits: jest.fn(),
    getHabitDays: jest.fn(),
    getDayStatuses: jest.fn(() => Promise.resolve([])),
  },
}));

const api = tracker as jest.Mocked<typeof tracker>;
const today = localDate('Asia/Kolkata');

const read: ProgressHabit = {
  id: 'h1',
  identity_id: 'i1',
  title: 'Read',
  type: 'count',
  target: 20,
  unit: 'pages',
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  milestone_amount: 300,
  milestone_label: 'book',
  identities: { name: 'The Reader', colour_token: 'identity-1' },
};
const run: ProgressHabit = {
  ...read,
  id: 'h2',
  identity_id: 'i2',
  title: 'Run',
  type: 'boolean',
  target: null,
  unit: null,
  milestone_amount: null,
  milestone_label: null,
  identities: { name: 'The Athlete', colour_token: 'identity-2' },
};

const days: ProgressDay[] = Array.from({ length: 20 }, (_, index) => ({
  habit_id: 'h1',
  date: addDays(today, -1 - index),
  status: index === 3 ? 'missed' : index === 5 ? 'repaired' : 'done',
  level_done: index === 3 ? null : 'full',
  amount: index === 3 ? null : 20,
  target: 20,
  logged_hour: index === 3 ? null : 19,
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

describe('ProgressScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getProfile.mockResolvedValue({
      timezone: 'Asia/Kolkata',
      mode: 'grace',
      onboarded_at: null,
      reminder_time: null,
    });
    api.listProgressHabits.mockResolvedValue([read, run]);
    api.getHabitDays.mockResolvedValue(days);
  });

  it('waits until its tab is opened', async () => {
    await open(false);
    expect(api.getHabitDays).not.toHaveBeenCalled();
  });

  it('shows the identity score as days out of days', async () => {
    await open();
    expect(screen.getByText('19 of 20 days')).toBeTruthy();
  });

  it('shows the forecast with its milestone', async () => {
    await open();
    expect(screen.getByText(/books\.$/)).toBeTruthy();
  });

  it('updates the forecast as the slider moves', async () => {
    await open();
    await act(async () => {
      fireEvent(screen.getByTestId('forecast-rate'), 'valueChange', 100);
    });
    expect(screen.getByText('About 7,300 pages in a year, or about 24 books.')).toBeTruthy();
  });

  it('marks a repaired streak day and a fracture in the history', async () => {
    await open();
    expect(screen.getByText(/1 repaired · ended/)).toBeTruthy();
    expect(screen.getByText(/still going/)).toBeTruthy();
  });

  it('describes the heatmap in words for a screen reader', async () => {
    await open();
    expect(screen.getByLabelText(/In the last year: .*1 repaired.*1 not done/)).toBeTruthy();
  });

  it('shows the time they usually do it', async () => {
    await open();
    expect(screen.getByText('You usually do Read around 7pm.')).toBeTruthy();
  });

  it('switches habit', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByText('A forecast needs a week of history.')).toBeTruthy();
  });

  it('never calls a miss a failure', async () => {
    await open();
    expect(screen.queryByText(/fail|broken|lost/i)).toBeNull();
  });

  it('offers a retry when loading fails', async () => {
    api.getHabitDays.mockRejectedValueOnce(new Error('offline'));
    await open();
    expect(screen.getByText("Your progress couldn't load.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => {});
    expect(screen.getByText('19 of 20 days')).toBeTruthy();
  });

  it('points to adding a habit when there are none', async () => {
    api.listProgressHabits.mockResolvedValue([]);
    await open();
    expect(screen.getByText('Add a habit, and your progress will show up here.')).toBeTruthy();
  });
});
