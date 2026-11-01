import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TodayRow } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';
import { TodayScreen } from './TodayScreen';

jest.mock('../services/tracker', () => ({
  tracker: {
    getToday: jest.fn(),
    getRepairs: jest.fn(() => Promise.resolve([])),
    logHabit: jest.fn(() => Promise.resolve()),
    undoLog: jest.fn(() => Promise.resolve()),
    skipHabit: jest.fn(() => Promise.resolve()),
    repairHabit: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const api = tracker as jest.Mocked<typeof tracker>;

const row = (patch: Partial<TodayRow> = {}): TodayRow => ({
  day: '2026-11-03',
  is_today: true,
  habit_id: 'h1',
  identity_id: 'i1',
  identity_name: 'The Athlete',
  colour_token: 'identity-1',
  title: 'Run',
  habit_type: 'boolean',
  target: null,
  unit: null,
  status: 'pending',
  level_done: null,
  amount: null,
  skip_reason: null,
  current_streak: 3,
  levels: [
    { level: 'full', description: 'Run 5 km', target: null },
    { level: 'minimum', description: 'Run 1 km', target: null },
    { level: 'setup', description: 'Put on shoes', target: null },
  ],
  can_repair: false,
  repair_amount: null,
  ...patch,
});

const open = async (rows: TodayRow[]) => {
  api.getToday.mockResolvedValue(rows);
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider forced="light">
        <TodayScreen onAddHabit={jest.fn()} onEditHabit={jest.fn()} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(async () => {});
};

describe('TodayScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('groups habits by identity', async () => {
    await open([
      row(),
      row({ habit_id: 'h2', title: 'Read', identity_id: 'i2', identity_name: 'The Reader' }),
    ]);
    expect(screen.getByText('The Athlete')).toBeTruthy();
    expect(screen.getByText('The Reader')).toBeTruthy();
  });

  it('logs the full version with one tap', async () => {
    await open([row()]);
    await fireEvent.press(screen.getByRole('button', { name: /^Run/ }));
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'full', null);
  });

  it('undoes with a tap on a logged habit', async () => {
    await open([row({ status: 'done', level_done: 'full' })]);
    await fireEvent.press(screen.getByRole('button', { name: /^Run/ }));
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-03');
  });

  it('opens the Shrink sheet on long press and logs the chosen level', async () => {
    await open([row()]);
    await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Minimum version, Run 1 km' }));
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'minimum', null);
  });

  it('offers a repair only when the server says it can happen', async () => {
    await open([row({ can_repair: true })]);
    await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: /^Repair the last miss/ }));
    expect(api.repairHabit).toHaveBeenCalledWith('h1', '2026-11-03', null);
  });

  it('hides repair otherwise', async () => {
    await open([row()]);
    await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
    expect(screen.queryByText('Repair the last miss')).toBeNull();
  });

  it('skips with a reason from the Shrink sheet', async () => {
    await open([row()]);
    await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip today' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Sick' }));
    expect(api.skipHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'Sick');
  });

  it('keeps a typed skip reason disabled until there is text', async () => {
    await open([row()]);
    await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip today' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(api.skipHabit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Another reason'), 'Doctor said rest');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(api.skipHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'Doctor said rest');
  });

  it('shows days that can still be back-logged', async () => {
    await open([row(), row({ day: '2026-11-02', is_today: false })]);
    expect(screen.getByText('Still open from yesterday')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: /^Run/ })[1]);
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', null);
  });

  it('labels an open day from yesterday as not logged yet', async () => {
    await open([row({ day: '2026-11-02', is_today: false })]);
    expect(screen.getByRole('button', { name: /^Run, Not logged yet/ })).toBeTruthy();
    expect(screen.queryByText(/Due today/)).toBeNull();
  });

  it('shows a closed miss with its repair day', async () => {
    api.getRepairs.mockResolvedValueOnce([
      {
        habit_id: 'h9',
        identity_id: 'i1',
        identity_name: 'The Athlete',
        colour_token: 'identity-1',
        title: 'Stretch',
        missed_on: '2026-11-02',
        repair_on: '2026-11-05',
        current_streak: 0,
      },
    ]);
    await open([]);
    expect(screen.getByText('Can still be repaired')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stretch, Repair on Thu' })).toBeTruthy();
    expect(screen.queryByText('Nothing is due today.')).toBeNull();
  });

  describe.each([
    [9, ['Still open from yesterday', 'The Athlete']],
    [20, ['The Athlete', 'Still open from yesterday']],
  ])('at %i:00', (hour, order) => {
    it('orders the sections for that time of day', async () => {
      jest.useFakeTimers({ now: new Date(2026, 10, 3, hour), doNotFake: ['nextTick', 'setImmediate'] });
      await open([row(), row({ day: '2026-11-02', is_today: false })]);
      const headers = screen.getAllByRole('header').map((h) => h.props.children);
      expect(headers.filter((h) => order.includes(h))).toEqual(order);
      jest.useRealTimers();
    });
  });

  it('adds the evening note only in the evening', async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 3, 20), doNotFake: ['nextTick', 'setImmediate'] });
    await open([row()]);
    expect(screen.getByText(/A smaller version still counts/)).toBeTruthy();
    jest.useRealTimers();
  });

  it('rolls back and explains when a log fails', async () => {
    api.logHabit.mockRejectedValueOnce(new Error('The back-log window for that day has closed'));
    await open([row()]);
    await fireEvent.press(screen.getByRole('button', { name: /^Run/ }));
    await act(async () => {});
    expect(screen.getByText('The back-log window for that day has closed')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Run, Due today/ })).toBeTruthy();
  });

  it('offers a retry when loading fails, instead of an empty list', async () => {
    api.getToday.mockRejectedValueOnce(new Error('offline'));
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider forced="light">
          <TodayScreen onAddHabit={jest.fn()} onEditHabit={jest.fn()} />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    await act(async () => {});
    expect(screen.getByText("Your habits couldn't load.")).toBeTruthy();
  });

  it('explains an empty day', async () => {
    await open([]);
    expect(screen.getByText('Nothing is due today.')).toBeTruthy();
  });

  it('shows no shame wording for a miss', async () => {
    await open([row({ status: 'missed', current_streak: 0 })]);
    expect(screen.queryByText(/fail|broke|lost/i)).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });
});
