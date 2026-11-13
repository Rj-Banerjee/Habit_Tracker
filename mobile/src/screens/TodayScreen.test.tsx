import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RULE_CARDS, TodayRow } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { watchMyActivity } from '../services/live';
import { syncHabitReminders } from '../services/reminders';
import type { AmountResult } from '@habit-tracker/core';
import { CHECKIN_POPUP_KEY } from '../hooks/useCheckin';
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
    isLocked: jest.fn(() => false),
    clearPending: jest.fn(),
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
  syncHabitReminders: jest.fn(() => Promise.resolve({ status: 'set' })),
}));
jest.mock('../services/live', () => ({ watchMyActivity: jest.fn(() => () => {}) }));
jest.mock('../services/speak', () => ({ speak: jest.fn() }));
jest.mock('../voice/speech', () => ({ speechInput: () => null }));

jest.mock('../services/tracker', () => ({
  tracker: {
    getDay: jest.fn(() => Promise.resolve([])),
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
    addAmount: jest.fn(),
    getProfile: jest.fn(() => Promise.resolve({ seen_tips: [] })),
    countActiveHabits: jest.fn(() => Promise.resolve(2)),
    markTipSeen: jest.fn(() => Promise.resolve()),
    listCompletedHabits: jest.fn(() => Promise.resolve([])),
    updateHabit: jest.fn(() => Promise.resolve()),
    getWeekStatuses: jest.fn(() => Promise.resolve([])),
    getCheckinState: jest.fn(() => Promise.reject(new Error('off'))),
    getHeadsUp: jest.fn(() => Promise.resolve(null)),
    getWarning: jest.fn(() => Promise.resolve(null)),
    getUnseenAiChanges: jest.fn(() => Promise.resolve([])),
    applyHeadsUp: jest.fn(() => Promise.resolve('c1')),
    dismissHeadsUp: jest.fn(() => Promise.resolve()),
    snoozeWarning: jest.fn(() => Promise.resolve()),
    undoAiChange: jest.fn(() => Promise.resolve()),
    markAiChangesSeen: jest.fn(() => Promise.resolve()),
    saveCheckin: jest.fn(() => Promise.resolve()),
    skipCheckin: jest.fn(() => Promise.resolve()),
    answerCheckinOffer: jest.fn(() => Promise.resolve()),
    getAnalytics: jest.fn((from: string, to: string) =>
      Promise.resolve({
        from,
        to,
        today: to,
        habits: [
          {
            id: 'h1',
            title: 'Run',
            type: 'boolean',
            unit: null,
            frequency: 'days',
            per_week: null,
            target: null,
            schedule_days: [1, 2, 3, 4, 5, 6, 7],
            identity_id: 'i1',
            identity_name: 'The Runner',
            colour_token: 'identity-1',
            starts_on: from,
            ends_on: null,
            reminder_time: null,
            time_of_day: 'morning',
            milestone_amount: null,
            milestone_label: null,
            current_streak: 0,
            longest_streak: 0,
          },
        ],
        days: [],
        weeks: [],
        grace_spent: [],
      })
    ),
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

  it('refreshes each habit\'s reminders when Today changes', async () => {
    await open([row()]);
    expect(syncHabitReminders).toHaveBeenCalled();
  });

  describe('times per week', () => {
    const workout = (patch: Partial<TodayRow> = {}) =>
      row({ title: 'Workout', frequency: 'per_week', week_done: 2, week_quota: 4, week_days_left: 5, current_streak: 6, ...patch });

    it('shows how the week is going, and a streak in weeks', async () => {
      await open([workout()]);
      expect(screen.getByText(/This week: 2 of 4/)).toBeTruthy();
      expect(screen.getByText('weeks')).toBeTruthy();
    });

    it('shows as done for the week once met, and still logs another session', async () => {
      await open([workout({ week_done: 4 })]);
      expect(screen.getByText(/Done for this week/)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: /^Workout/ }));
      expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'full', null, 'tap');
    });

    it('draws its chain in weeks', async () => {
      api.getWeekStatuses.mockResolvedValueOnce([
        { habit_id: 'h1', week_start: '2026-10-26', status: 'met', quota: 4, sessions: 4, repair_by: null },
        { habit_id: 'h1', week_start: '2026-11-02', status: 'pending', quota: 4, sessions: 2, repair_by: null },
      ]);
      await open([workout()]);
      expect(screen.getByLabelText(/^Last 2 weeks: week of 26 Oct done/)).toBeTruthy();
    });

    it('has nothing to skip', async () => {
      await open([workout()]);
      await fireEvent(screen.getByRole('button', { name: /^Workout/ }), 'longPress');
      expect(screen.queryByRole('button', { name: 'Skip today' })).toBeNull();
    });
  });

  describe('time of day', () => {
    it('has no Move to options in the long-press sheet: cards are dragged instead', async () => {
      await open([row({ time_of_day: 'morning' })]);
      await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
      expect(screen.queryByRole('button', { name: /^Move to/ })).toBeNull();
    });

    it('has a chip for each part of the day, and a quiet line under one with nothing in it', async () => {
      await open([row({ time_of_day: 'morning' })]);
      for (const name of ['All habits', 'Morning habits', 'Afternoon habits', 'Evening habits', 'Anytime habits']) {
        expect(screen.getByRole('tab', { name })).toBeTruthy();
      }
      expect(screen.getByRole('tab', { name: 'All habits', selected: true })).toBeTruthy();
      await fireEvent.press(screen.getByRole('tab', { name: 'Evening habits' }));
      expect(screen.getByRole('tab', { name: 'Evening habits', selected: true })).toBeTruthy();
      expect(screen.getByText('Nothing in the evening yet')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Run/ })).toBeNull();
    });

    describe('on Pro', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const entitlements = require('../hooks/useEntitlements');
      const evenings = Array.from({ length: 6 }, (_, i) => ({
        habit_id: 'h1', date: `2026-10-2${i}`, status: 'done', level_done: 'full', amount: null, target: null, logged_hour: 20,
      })); // prettier-ignore

      beforeEach(() => {
        jest.spyOn(entitlements, 'useEntitlements').mockReturnValue({ plan: 'pro', ready: true, can: () => true });
      });
      afterEach(() => jest.restoreAllMocks());

      it('offers to move a habit to when it is usually done, and moves it only on Move', async () => {
        api.getHabitDays.mockResolvedValue(evenings as never);
        await open([row({ time_of_day: 'morning' })]);
        expect(screen.getByText('You usually do Run in the evening. Move it there?')).toBeTruthy();
        expect(api.updateHabit).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByRole('button', { name: 'Move' }));
        await act(async () => {});
        expect(api.updateHabit).toHaveBeenCalledWith('h1', { timeOfDay: 'evening' });
        api.getHabitDays.mockResolvedValue([]);
      });

      it('remembers a Keep', async () => {
        api.getHabitDays.mockResolvedValue(evenings as never);
        await open([row({ time_of_day: 'morning' })]);
        await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
        expect(screen.queryByText(/Move it there/)).toBeNull();
        expect(api.markTipSeen).toHaveBeenCalledWith('time-kept:h1:evening');
        expect(api.updateHabit).not.toHaveBeenCalled();
        api.getHabitDays.mockResolvedValue([]);
      });
    });
  });

  describe('a habit that ended', () => {
    const ended = {
      habit_id: 'h9', title: 'Read', identity_name: 'The Reader', colour_token: 'identity-1',
      starts_on: '2026-10-01', ends_on: '2026-10-30', frequency: 'days', days_done: 24,
      best_streak: 12, total_amount: null, unit: null, restarted: false,
    } as const; // prettier-ignore
    const text = "You finished Read. 24 days done, best streak 12 days. That's worth a moment.";

    it('is celebrated once, calmly', async () => {
      api.listCompletedHabits.mockResolvedValueOnce([ended]);
      await open([row()]);
      expect(screen.getByText(text)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText(text)).toBeNull();
      expect(api.markTipSeen).toHaveBeenCalledWith('ended:h9');
    });

    it('is not celebrated again', async () => {
      api.listCompletedHabits.mockResolvedValueOnce([ended]);
      api.getProfile.mockResolvedValue({ seen_tips: ['ended:h9'] } as never);
      await open([row()]);
      expect(screen.queryByText(text)).toBeNull();
      api.getProfile.mockResolvedValue({ seen_tips: [] } as never);
    });
  });

  describe('the habit tip', () => {
    const tip = 'Starting with a few makes them stick.';

    it('says nothing up to 6 habits', async () => {
      api.countActiveHabits.mockResolvedValue(6);
      await open([row()]);
      expect(screen.queryByText(tip)).toBeNull();
    });

    it('shows once past 6 habits, and is remembered when dismissed', async () => {
      api.countActiveHabits.mockResolvedValue(7);
      await open([row()]);
      expect(screen.getByText(tip)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText(tip)).toBeNull();
      expect(api.markTipSeen).toHaveBeenCalledWith('habit-tip');
    });

    it('stays away once seen, on any device', async () => {
      api.countActiveHabits.mockResolvedValue(12);
      api.getProfile.mockResolvedValue({ seen_tips: ['habit-tip'] } as never);
      await open([row()]);
      expect(screen.queryByText(tip)).toBeNull();
    });
  });

  describe('Habit connections on Today', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const entitlements = require('../hooks/useEntitlements');
    const headsUp = {
      finding_id: 'f1', key: 'k', kind: 'after_big_amount', a_id: 'h0', a_title: 'Long run', b_id: 'h1',
      b_title: 'Study', numbers: { after_big: 43, otherwise: 87 },
    }; // prettier-ignore

    beforeEach(() => {
      jest.spyOn(entitlements, 'useEntitlements').mockReturnValue({ plan: 'pro', ready: true, can: () => true });
    });
    afterEach(() => jest.restoreAllMocks());

    it('gives a morning heads-up, with the fix as a button', async () => {
      api.getHeadsUp.mockResolvedValue(headsUp as never);
      await open([row()]);
      expect(
        screen.getByText("Heads-up: after a big Long run yesterday, Study often slips (43% against 87%). Make today's Study just the minimum?")
      ).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Minimum Study today' }));
      await act(async () => {});
      expect(api.applyHeadsUp).toHaveBeenCalledWith('f1');
      expect(screen.queryByTestId('heads-up')).toBeNull();
    });

    it('lets the heads-up go for today', async () => {
      api.getHeadsUp.mockResolvedValue(headsUp as never);
      await open([row()]);
      await fireEvent.press(screen.getByRole('button', { name: 'Not today' }));
      expect(api.dismissHeadsUp).toHaveBeenCalled();
      expect(screen.queryByTestId('heads-up')).toBeNull();
    });

    it('warns kindly about a serious pattern, and can be put off for a week', async () => {
      api.getWarning.mockResolvedValue({ kind: 'dragging', habit: 'Long run', slipping: ['Study', 'Read'] } as never);
      await open([row()]);
      expect(screen.getByText(/Long run seems linked to Study and Read slipping/)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Got it: hide this for a week' }));
      expect(api.snoozeWarning).toHaveBeenCalled();
      expect(screen.queryByTestId('warning')).toBeNull();
    });

    it('says what Autopilot changed, with Undo', async () => {
      api.getUnseenAiChanges.mockResolvedValue([
        { id: 'c1', habit_title: 'Study', reason: "After Long run yesterday, Study's goal is the minimum today", applied_at: '' },
      ] as never);
      await open([row()]);
      expect(screen.getByText("After Long run yesterday, Study's goal is the minimum today.")).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: /^Undo: After Long run/ }));
      await act(async () => {});
      expect(api.undoAiChange).toHaveBeenCalledWith('c1');
      expect(screen.queryByTestId('autopilot-notice')).toBeNull();
    });

    it('shows none of it on Free', async () => {
      jest.spyOn(entitlements, 'useEntitlements').mockReturnValue({ plan: 'free', ready: true, can: () => false });
      api.getHeadsUp.mockResolvedValue(headsUp as never);
      await open([row()]);
      expect(api.getHeadsUp).not.toHaveBeenCalled();
      expect(screen.queryByTestId('heads-up')).toBeNull();
    });
  });

  describe('the daily check-in', () => {
    beforeEach(async () => {
      await AsyncStorage.clear();
      api.getCheckinState.mockRejectedValue(new Error('off'));
    });

    const state = (patch = {}) => ({
      time: 'morning',
      today: '2026-11-03',
      hour: 8,
      checkin: null,
      skipped_today: false,
      ask_to_turn_off: false,
      ...patch,
    });

    it('takes energy, sleep and mood in a few taps', async () => {
      api.getCheckinState.mockResolvedValue(state() as never);
      await open([row()]);
      expect(screen.getByText('Only you can see this.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save', disabled: true })).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Energy 2 of 5, low' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Fewer, Hours slept' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Mood 4 of 5, good' }));
      api.getCheckinState.mockResolvedValue(
        state({ checkin: { date: '2026-11-03', energy: 2, sleep_hours: 6.5, mood: 4, source: 'tap' } }) as never
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
      await act(async () => {});
      expect(api.saveCheckin).toHaveBeenCalledWith({ sleep: 6.5, energy: 2, mood: 4 }, 'tap');
      expect(screen.queryByTestId('checkin-card')).toBeNull();
    });

    it('can be skipped for the day', async () => {
      api.getCheckinState.mockResolvedValue(state() as never);
      await open([row()]);
      await fireEvent.press(screen.getByRole('button', { name: 'Skip for today' }));
      expect(screen.queryByTestId('checkin-card')).toBeNull();
      expect(api.skipCheckin).toHaveBeenCalled();
    });

    it('slides up from the bottom once a day', async () => {
      api.getCheckinState.mockResolvedValue(state() as never);
      await open([row()]);
      expect(screen.getByRole('header', { name: 'Daily check-in' })).toBeTruthy();
      // Closed without an answer, by the backdrop (or Android's back).
      await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByTestId('checkin-card')).toBeNull();
      expect(await AsyncStorage.getItem(CHECKIN_POPUP_KEY)).toBe('2026-11-03');
      expect(api.skipCheckin).not.toHaveBeenCalled();
    });

    it('stays down for the rest of a day it already came up', async () => {
      await AsyncStorage.setItem(CHECKIN_POPUP_KEY, '2026-11-03');
      api.getCheckinState.mockResolvedValue(state() as never);
      await open([row()]);
      expect(screen.queryByTestId('checkin-card')).toBeNull();
    });

    it('comes back the next day', async () => {
      await AsyncStorage.setItem(CHECKIN_POPUP_KEY, '2026-11-02');
      api.getCheckinState.mockResolvedValue(state() as never);
      await open([row()]);
      expect(screen.getByTestId('checkin-card')).toBeTruthy();
    });

    it('waits for the evening when set to evening, and stays away when off', async () => {
      api.getCheckinState.mockResolvedValue(state({ time: 'evening', hour: 10 }) as never);
      await open([row()]);
      expect(screen.queryByTestId('checkin-card')).toBeNull();
    });

    it('asks once, after 3 skipped days, whether to turn it off', async () => {
      api.getCheckinState.mockResolvedValue(state({ ask_to_turn_off: true }) as never);
      await open([row()]);
      await fireEvent.press(screen.getByRole('button', { name: 'Turn off' }));
      expect(api.answerCheckinOffer).toHaveBeenCalledWith(false);
      expect(screen.queryByText(/Turn off the daily check-in/)).toBeNull();
      expect(screen.queryByTestId('checkin-card')).toBeNull();
    });

    it('is simply not there when it cannot load', async () => {
      await open([row()]);
      expect(screen.queryByTestId('checkin-card')).toBeNull();
      expect(screen.getByRole('button', { name: /^Run, / })).toBeTruthy();
    });
  });

  describe('the Sunday card', () => {
    it("leads with the week's numbers on a Sunday", async () => {
      const sunday = '2026-11-08';
      const base = await api.getAnalytics('2026-10-26', sunday);
      api.getAnalytics.mockResolvedValueOnce({
        ...base,
        days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((date, i) => ({
          habit_id: 'h1',
          date,
          status: i === 3 ? 'missed' : 'done',
          log_status: i === 3 ? null : 'done',
          level_done: i === 3 ? null : 'full',
          amount: null,
          source: i === 3 ? null : 'tap',
          skip_reason: null,
          target: null,
          minimum: null,
          logged_minute: null,
        })),
      } as never);
      await open([row({ day: sunday })]);
      expect(api.getAnalytics).toHaveBeenLastCalledWith('2026-10-26', sunday);
      expect(screen.getByText('75% done this week. Ready to look back?')).toBeTruthy();
    });

    it('asks for no numbers on other days', async () => {
      await open([row()]);
      expect(api.getAnalytics).not.toHaveBeenCalled();
    });
  });

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

    it('still logs a Done from the notification for a habit no longer on Today', async () => {
      const lock = jest.requireMock('../../modules/focus-lock').FocusLock;
      lock.status.mockReturnValueOnce({
        habitId: 'yesterday-habit', title: 'Old', minutes: 25, endAt: Date.parse('2026-11-02T10:00:00Z'),
        paused: true, remainingMs: 0, timeUp: false, pending: 'done',
      });
      await open([row()]);
      await act(async () => {});
      expect(api.logHabit).toHaveBeenCalledWith('yesterday-habit', expect.stringMatching(/^2026-11-0[12]$/), 'full', null, 'notification');
      expect(lock.stop).toHaveBeenCalled();
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

  describe('the time-of-day chips', () => {
    const habits = [
      row({ time_of_day: 'evening' }),
      row({ habit_id: 'h2', title: 'Read', identity_id: 'i2', identity_name: 'The Reader', time_of_day: 'morning' }),
      row({ habit_id: 'h3', title: 'Water' }),
    ];
    const cards = () => screen.getAllByRole('button', { name: /^(Run|Read|Water), / }).map((b) => b.props.accessibilityLabel.split(',')[0]);

    it('lists every habit in the order of the day under ALL, with no section headings', async () => {
      await open(habits);
      expect(cards()).toEqual(['Read', 'Run', 'Water']);
      const headers = screen.getAllByRole('header').map((h) => h.props.children);
      expect(headers.filter((h) => ['Morning', 'Afternoon', 'Evening', 'Anytime'].includes(h))).toEqual([]);
    });

    it('shows one part of the day at a time', async () => {
      await open(habits);
      await fireEvent.press(screen.getByRole('tab', { name: 'Morning habits' }));
      expect(cards()).toEqual(['Read']);
      await fireEvent.press(screen.getByRole('tab', { name: 'Anytime habits' }));
      expect(cards()).toEqual(['Water']);
      await fireEvent.press(screen.getByRole('tab', { name: 'All habits' }));
      expect(cards()).toHaveLength(3);
    });
  });

  describe('the date strip', () => {
    const tab = (name: RegExp) => screen.getByRole('tab', { name });

    it('starts on today, under a big TODAY', async () => {
      await open([row()]);
      expect(screen.getByRole('header', { name: 'TODAY' })).toBeTruthy();
      expect(screen.getByText('Tuesday, Nov 3')).toBeTruthy();
      expect(tab(/^Today, Tuesday, November 3/).props.accessibilityState).toEqual({ selected: true });
      expect(api.getDay).not.toHaveBeenCalled();
    });

    it('loads another day, and logs one still in its back-log window', async () => {
      api.getDay.mockResolvedValueOnce([row({ day: '2026-11-02', is_today: false, can_change: true })]);
      await open([row()]);
      await fireEvent.press(tab(/^Monday, November 2/));
      await act(async () => {});
      expect(api.getDay).toHaveBeenCalledWith('2026-11-02');
      expect(screen.getByRole('header', { name: 'YESTERDAY' })).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: /^Run, / }));
      expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', null, 'tap');
      // Back to today, its own list again.
      await fireEvent.press(tab(/^Today, /));
      expect(screen.getByRole('header', { name: 'TODAY' })).toBeTruthy();
    });

    it('shows an older day as view only', async () => {
      api.getDay.mockResolvedValueOnce([row({ day: '2026-10-30', is_today: false, status: 'missed', can_change: false })]);
      await open([row()]);
      await fireEvent.press(tab(/^Friday, October 30/));
      await act(async () => {});
      expect(screen.getByRole('header', { name: 'OCT 30' })).toBeTruthy();
      expect(screen.getByText('Past its back-log window, so this day is view only.')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: /^Run, / }));
      expect(api.logHabit).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Log by voice' })).toBeNull();
    });

    it('shows what is coming on a later day, without logging it', async () => {
      api.getDay.mockResolvedValueOnce([row({ day: '2026-11-05', is_today: false, can_change: false })]);
      await open([row()]);
      await fireEvent.press(tab(/^Thursday, November 5/));
      await act(async () => {});
      expect(screen.getByText('Still to come, so nothing can be logged yet.')).toBeTruthy();
    });

    it('says when a day could not load', async () => {
      api.getDay.mockRejectedValueOnce(new Error('offline'));
      await open([row()]);
      await fireEvent.press(tab(/^Sunday, November 1/));
      await act(async () => {});
      expect(screen.getByText("That day couldn't load.")).toBeTruthy();
    });
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

  describe('adding an amount', () => {
    const read = () =>
      row({
        title: 'Read',
        habit_type: 'count',
        target: 10,
        unit: 'pages',
        levels: [
          { level: 'full', description: 'Ten pages', target: 10 },
          { level: 'minimum', description: 'Two pages', target: 2 },
        ],
      });
    const answer = (patch: Partial<AmountResult> = {}): AmountResult => ({
      counted: true, added: 1, total: 1, unit: 'pages', said_unit: null, minimum: 2, target: 10,
      status: 'partial' as const, level: null, repaired: false, ...patch,
    }); // prettier-ignore

    const add = async (text: string) => {
      await fireEvent(screen.getByRole('button', { name: /^Read/ }), 'longPress');
      await fireEvent.changeText(screen.getByLabelText('Add an amount'), text);
      await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
      await act(async () => {});
    };

    it('adds 1 page and says what is left for the minimum', async () => {
      api.addAmount.mockResolvedValue(answer());
      await open([read()]);
      await add('1');
      expect(api.addAmount).toHaveBeenCalledWith('h1', '2026-11-03', 1, null, 'tap');
      expect(screen.getByText('Read: 1 of 10 pages, 1 more for your minimum.')).toBeTruthy();
    });

    it('uses the lower number of a range, with its unit', async () => {
      api.addAmount.mockResolvedValue(answer({ added: 2, total: 2, status: 'done', level: 'minimum' }));
      await open([read()]);
      await add('2-3 pages');
      expect(api.addAmount).toHaveBeenCalledWith('h1', '2026-11-03', 2, 'pages', 'tap');
    });

    it('says calmly when the unit cannot count', async () => {
      api.addAmount.mockResolvedValue(answer({ counted: false, added: 0, total: 0, said_unit: 'lines', status: 'none' }));
      await open([read()]);
      await add('2-3 lines');
      expect(screen.getByText("That's below your minimum: lines can't count toward pages. Read is at 0 of 10 pages.")).toBeTruthy();
    });

    it('asks for an amount it can read', async () => {
      await open([read()]);
      await add('lots');
      expect(api.addAmount).not.toHaveBeenCalled();
      expect(screen.getByText('Enter an amount, like 3 or 2-3 pages.')).toBeTruthy();
    });

    it("isn't offered for a yes/no habit", async () => {
      await open([row()]);
      await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
      expect(screen.queryByLabelText('Add an amount')).toBeNull();
    });

    it('shows progress below the minimum on the card', async () => {
      await open([{ ...read(), amount: 1 }]);
      expect(screen.getByText(/1 of 10 pages so far/)).toBeTruthy();
    });
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
    [9, ['Still open from yesterday', 'Today']],
    [20, ['Today', 'Still open from yesterday']],
  ])('at %i:00', (hour, order) => {
    it('orders the sections for that time of day', async () => {
      jest.useFakeTimers({ now: new Date(2026, 10, 3, hour), doNotFake: ['nextTick', 'setImmediate'] });
      await open([row(), row({ day: '2026-11-02', is_today: false })]);
      // Today's cards, then yesterday's, or the other way round in the morning.
      const parts = screen
        .getAllByRole(/^(header|button)$/)
        .map((el) => (el.props.children === 'Still open from yesterday' ? 'Still open from yesterday' : el.props.accessibilityLabel))
        .filter((name) => name === 'Still open from yesterday' || /^Run, Due today/.test(name ?? ''))
        .map((name) => (name === 'Still open from yesterday' ? name : 'Today'));
      expect(parts).toEqual(order);
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
