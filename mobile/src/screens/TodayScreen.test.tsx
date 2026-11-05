import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RULE_CARDS, TodayRow } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { watchMyActivity } from '../services/live';
import { tracker } from '../services/tracker';
import { TodayScreen } from './TodayScreen';

jest.mock('../services/ai', () => ({ ai: { chat: jest.fn(), parseVoice: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../hooks/useNudges', () => ({ useNudges: jest.fn() }));
jest.mock('../services/widget', () => ({ refreshWidget: jest.fn() }));
jest.mock('../../modules/focus-lock', () => ({
  FocusLock: {
    pin: jest.fn(() => true),
    unpin: jest.fn(),
    isPinned: jest.fn(() => true),
    openPinningSettings: jest.fn(),
    start: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    status: jest.fn(() => null),
  },
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../services/reminders', () => ({
  showHeldNotifications: jest.fn(() => Promise.resolve()),
  notificationsAllowed: jest.fn(() => Promise.resolve(true)),
  askForNotifications: jest.fn(() => Promise.resolve()),
}));
jest.mock('../services/live', () => ({ watchMyActivity: jest.fn(() => () => {}) }));
jest.mock('../services/speak', () => ({ speak: jest.fn() }));
jest.mock('../voice/speech', () => ({ speechInput: () => null }));

jest.mock('../services/tracker', () => ({
  tracker: {
    listVoiceHabits: jest.fn(() => Promise.resolve([])),
    getToday: jest.fn(),
    getRepairs: jest.fn(() => Promise.resolve([])),
    logHabit: jest.fn(() => Promise.resolve()),
    undoLog: jest.fn(() => Promise.resolve()),
    skipHabit: jest.fn(() => Promise.resolve()),
    repairHabit: jest.fn(() => Promise.resolve()),
    getHabitDays: jest.fn(() => Promise.resolve([])),
    getDayStatuses: jest.fn(() => Promise.resolve([])),
    recordFocus: jest.fn(() => Promise.resolve()),
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
        <TodayScreen onAddHabit={jest.fn()} onEditHabit={jest.fn()} onOpenReview={jest.fn()} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(async () => {});
};

describe('TodayScreen', () => {
  it('reloads when the app comes back, so a widget log shows up', async () => {
    const listeners: ((state: string) => void)[] = [];
    (AppState.addEventListener as jest.Mock).mockImplementationOnce((_, listener) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    });
    await open([row()]);
    api.getToday.mockClear();
    await act(async () => listeners[0]('background'));
    expect(api.getToday).not.toHaveBeenCalled();
    await act(async () => listeners[0]('active'));
    expect(api.getToday).toHaveBeenCalled();
  });

  it('reloads while open when a log happens on another device', async () => {
    await open([row()]);
    api.getToday.mockClear();
    api.getToday.mockResolvedValue([row({ status: 'done', level_done: 'full' })]);
    const [onChange] = (watchMyActivity as jest.Mock).mock.calls.at(-1);
    await act(async () => onChange());
    expect(api.getToday).toHaveBeenCalled();
  });

  it('stops listening when Today goes away', async () => {
    const stop = jest.fn();
    (watchMyActivity as jest.Mock).mockReturnValueOnce(stop);
    await open([row()]);
    await act(async () => screen.unmount());
    expect(stop).toHaveBeenCalled();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('streak chain', () => {
    const week = Array.from({ length: 7 }, (_, i) => `2026-10-${String(28 + i).padStart(2, '0')}`)
      .map((d) => (d > '2026-10-31' ? `2026-11-${String(Number(d.slice(8)) - 31).padStart(2, '0')}` : d));
    const statuses = week.map((date) => ({
      habit_id: 'h1',
      date,
      status: date === '2026-11-03' ? 'pending' : 'done',
      repair_on: null,
    }));
    const habitDays = statuses.map((s) => ({ ...s, level_done: s.status === 'done' ? 'full' : null, amount: null, target: null }));

    beforeEach(() => {
      api.getHabitDays.mockResolvedValue(habitDays as never);
      api.getDayStatuses.mockResolvedValue(statuses as never);
    });

    it("shows the last 7 days on today's card", async () => {
      await open([row()]);
      expect(screen.getByLabelText(/^Last 7 days: Wed, 28 Oct done/)).toBeTruthy();
    });

    it('opens the streak and details from the chain, and comes back', async () => {
      await open([row()]);
      await fireEvent.press(screen.getByRole('button', { name: 'Run streak' }));
      await act(async () => {});
      expect(screen.getByText('The last 30 scheduled days')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(screen.queryByText('The last 30 scheduled days')).toBeNull();
    });

    it('offers the streak and details in the long-press sheet too', async () => {
      await open([row()]);
      await fireEvent(screen.getByRole('button', { name: /^Run, / }), 'longPress');
      await fireEvent.press(screen.getByRole('button', { name: 'Streak and details' }));
      await act(async () => {});
      expect(screen.getByText('The last 30 scheduled days')).toBeTruthy();
    });

    it('still works when the chain cannot load', async () => {
      api.getHabitDays.mockRejectedValue(new Error('offline'));
      await open([row()]);
      expect(screen.queryByLabelText(/^Last 7 days/)).toBeNull();
      expect(screen.getByRole('button', { name: /^Run, / })).toBeTruthy();
    });
  });

  describe('Tunnel Vision', () => {
    it("opens from the Focus button on today's card", async () => {
      await open([row()]);
      await fireEvent.press(screen.getByRole('button', { name: 'Focus on Run' }));
      expect(screen.getByText('Tunnel Vision')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start 25 minutes' })).toBeTruthy();
    });

    it('opens from the long-press sheet', async () => {
      await open([row()]);
      await fireEvent(screen.getByRole('button', { name: /^Run, / }), 'longPress');
      await fireEvent.press(screen.getByRole('button', { name: /^Focus, Tunnel Vision/ }));
      await act(async () => {});
      expect(screen.getByText('Tunnel Vision')).toBeTruthy();
    });

    it('comes back to a session the phone kept going with the app closed', async () => {
      const lock = jest.requireMock('../../modules/focus-lock').FocusLock;
      lock.status.mockReturnValueOnce({
        habitId: 'h1', title: 'Run', minutes: 25, endAt: Date.now() + 5 * 60_000, paused: false, remainingMs: 0, timeUp: false,
      });
      await open([row()]);
      await act(async () => {});
      expect(screen.getByText('Tunnel Vision')).toBeTruthy();
      expect(screen.getByText(/^0[45]:\d\d$/)).toBeTruthy();
    });

    it('unlocks the phone rather than trap it behind a habit that is not on screen', async () => {
      const lock = jest.requireMock('../../modules/focus-lock').FocusLock;
      lock.status.mockReturnValueOnce({
        habitId: 'gone', title: 'Old', minutes: 25, endAt: Date.now() + 60_000, paused: false, remainingMs: 0, timeUp: false,
      });
      await open([row()]);
      await act(async () => {});
      expect(lock.stop).toHaveBeenCalled();
      expect(screen.queryByText('Tunnel Vision')).toBeNull();
    });

    it("isn't offered for a day that's still open from yesterday", async () => {
      await open([row({ is_today: false, day: '2026-11-02', status: 'pending' })]);
      expect(screen.queryByRole('button', { name: 'Focus on Run' })).toBeNull();
    });

    it('logs through Today once the work is confirmed done', async () => {
      jest.useFakeTimers();
      try {
        await open([row()]);
        await fireEvent.press(screen.getByRole('button', { name: 'Focus on Run' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Start 25 minutes' }));
        await act(async () => jest.advanceTimersByTime(25 * 60_000));
        expect(api.logHabit).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByRole('button', { name: "Yes, it's done" }));
        expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'full', null, 'tap');
      } finally {
        jest.useRealTimers();
      }
    });
  });

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
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'full', null, 'tap');
  });

  it('undoes with a tap on a logged habit', async () => {
    await open([row({ status: 'done', level_done: 'full' })]);
    await fireEvent.press(screen.getByRole('button', { name: /^Run/ }));
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-03', 'tap');
  });

  it('opens the Shrink sheet on long press and logs the chosen level', async () => {
    await open([row()]);
    await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Minimum version, Run 1 km' }));
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'minimum', null, 'tap');
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
    expect(api.skipHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'Sick', 'tap');
  });

  it('keeps a typed skip reason disabled until there is text', async () => {
    await open([row()]);
    await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip today' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(api.skipHabit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Another reason'), 'Doctor said rest');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(api.skipHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'Doctor said rest', 'tap');
  });

  it('shows days that can still be back-logged', async () => {
    // Mornings list yesterday first, which would change the order below.
    const afternoon = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
    await open([row(), row({ day: '2026-11-02', is_today: false })]);
    expect(screen.getByText('Still open from yesterday')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: /^Run/ })[1]);
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', null, 'tap');
    afternoon.mockRestore();
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
          <TodayScreen onAddHabit={jest.fn()} onEditHabit={jest.fn()} onOpenReview={jest.fn()} />
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

  it('explains a rule the first time it comes up, and only once', async () => {
    const skipped = [row({ status: 'skipped', skip_reason: 'Sick' })];
    await open(skipped);
    expect(screen.getByText(RULE_CARDS.skip)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByLabelText('Got it')));
    expect(screen.queryByText(RULE_CARDS.skip)).toBeNull();

    await screen.unmount();
    await open(skipped);
    expect(screen.queryByText(RULE_CARDS.skip)).toBeNull();
  });
});
