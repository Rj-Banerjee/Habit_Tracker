import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, BackHandler } from 'react-native';
import { TodayRow } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { isHolding } from '../services/focusHold';
import { showHeldNotifications } from '../services/reminders';
import { tracker } from '../services/tracker';
import { FocusMode } from './FocusMode';

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../services/reminders', () => ({
  showHeldNotifications: jest.fn(() => Promise.resolve()),
  notificationsAllowed: jest.fn(() => Promise.resolve(true)),
  askForNotifications: jest.fn(() => Promise.resolve()),
  syncHabitReminders: jest.fn(() => Promise.resolve({ status: 'set' })),
}));
jest.mock('../services/haptics', () => ({ checkOffTick: jest.fn() }));
jest.mock('../services/tracker', () => ({ tracker: { recordFocus: jest.fn(() => Promise.resolve()) } }));
jest.mock('../voice/speech', () => ({ speechInput: jest.fn(() => null) }));
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
    resume: jest.fn(),
    stop: jest.fn(),
    status: jest.fn(() => null),
  },
}));

const api = tracker as jest.Mocked<typeof tracker>;
const keepAwake = jest.requireMock('expo-keep-awake').useKeepAwake as jest.Mock;
const lock = jest.requireMock('../../modules/focus-lock').FocusLock as Record<string, jest.Mock>;
const speech = jest.requireMock('../voice/speech').speechInput as jest.Mock;

const row = (patch: Partial<TodayRow> = {}): TodayRow =>
  ({
    day: '2026-11-05',
    is_today: true,
    habit_id: 'h1',
    title: 'Read',
    habit_type: 'count',
    target: 30,
    unit: 'pages',
    status: 'pending',
    level_done: null,
    amount: null,
    current_streak: 4,
    colour_token: 'identity-1',
    levels: [],
    ...patch,
  }) as TodayRow;

async function open(patch: Partial<TodayRow> = {}, saved: React.ComponentProps<typeof FocusMode>['saved'] = null) {
  const onLog = jest.fn();
  const onAddAmount = jest.fn();
  const onClose = jest.fn();
  const view = await render(
    <ThemeProvider forced="light">
      <FocusMode
        row={row(patch)}
        saved={saved}
        reducedMotion={false}
        onLog={onLog}
        onAddAmount={onAddAmount}
        onClose={onClose}
      />
    </ThemeProvider>
  );
  return { ...view, onLog, onAddAmount, onClose };
}

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const wait = (ms: number) => act(async () => jest.advanceTimersByTime(ms));

describe('Tunnel Vision', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-05T09:00:00Z') });
    jest.clearAllMocks();
    lock.isPinned.mockReturnValue(true);
    lock.isLocked.mockReturnValue(false);
    lock.status.mockReturnValue(null);
    speech.mockReturnValue(null);
  });
  afterEach(() => jest.useRealTimers());

  it('offers 25 minutes, or a duration habit its own target, editable before starting', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Start 25 minutes' })).toBeTruthy();
    await press('5 minutes more');
    expect(screen.getByRole('button', { name: 'Start 30 minutes' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Minutes'), '12');
    expect(screen.getByRole('button', { name: 'Start 12 minutes' })).toBeTruthy();
    await screen.unmount();
    await open({ habit_type: 'duration', target: 20, unit: 'minutes' });
    expect(screen.getByRole('button', { name: 'Start 20 minutes' })).toBeTruthy();
  });

  describe('a duration habit', () => {
    const study = { title: 'Study', habit_type: 'duration' as const, target: 60, unit: 'min' };

    it('starts at what is left today', async () => {
      await open({ ...study, amount: 35 });
      expect(screen.getByRole('button', { name: 'Start 25 minutes' })).toBeTruthy();
    });

    it('adds the time focused when it is done, instead of logging the whole hour', async () => {
      const { onLog, onAddAmount } = await open(study);
      await press('Start 60 minutes');
      await wait(25 * 60_000);
      await press('Done my work');
      expect(onAddAmount).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 'h1' }), 25);
      expect(onLog).not.toHaveBeenCalled();
    });

    it('asks to add the minutes done when stopped early', async () => {
      const { onLog, onAddAmount } = await open(study);
      await press('Start 60 minutes');
      await wait(12 * 60_000);
      await press('Stop');
      expect(screen.getByText('Add the 12 minutes you focused?')).toBeTruthy();
      await press('Yes');
      expect(onAddAmount).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 'h1' }), 12);
      expect(onLog).not.toHaveBeenCalled();
    });

    it('adds in hours for a habit counted in hours', async () => {
      const { onAddAmount } = await open({ ...study, target: 2, unit: 'hours' });
      await press('Start 120 minutes');
      await wait(30 * 60_000);
      await press('Done my work');
      expect(onAddAmount).toHaveBeenCalledWith(expect.anything(), 0.5);
    });
  });

  it('keeps the screen on', async () => {
    await open();
    expect(keepAwake).toHaveBeenCalledWith('tunnel-vision');
  });

  it('counts down in big numbers, then asks instead of logging', async () => {
    const { onLog } = await open();
    await press('5 minutes less');
    await press('Start 20 minutes');
    expect(api.recordFocus).toHaveBeenCalledWith('h1', 'focus.started', 1200, null);
    expect(screen.getByText('20:00')).toBeTruthy();
    await wait(60_000);
    expect(screen.getByText('19:00')).toBeTruthy();
    expect(screen.getByLabelText('19 minutes left')).toBeTruthy();
    await wait(19 * 60_000);
    expect(screen.getByText("Time's up. Is Read done?")).toBeTruthy();
    expect(onLog).not.toHaveBeenCalled();
    await press("Yes, it's done");
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 'h1' }), 'full');
    expect(api.recordFocus).toHaveBeenCalledWith('h1', 'focus.completed', 1200, 1200);
    expect(screen.getByText('Done. Nicely focused.')).toBeTruthy();
  });

  it('offers to focus again when the work is not done, and logs nothing', async () => {
    const { onLog, onClose } = await open();
    await press('Start 25 minutes');
    await wait(25 * 60_000);
    await press('Not yet');
    expect(screen.getByText('Focus again?')).toBeTruthy();
    await press('Focus 25 minutes more');
    expect(screen.getByText('25:00')).toBeTruthy();
    expect(lock.start).toHaveBeenCalledTimes(2);
    await wait(25 * 60_000);
    await press('Not yet');
    await press('Not now');
    await wait(250);
    expect(onLog).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(api.recordFocus).toHaveBeenLastCalledWith('h1', 'focus.stopped', 1500, 1500);
  });

  it('finishes early on "Done my work"', async () => {
    const { onLog } = await open();
    await press('Start 25 minutes');
    await wait(5 * 60_000);
    await press('Done my work');
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 'h1' }), 'full');
    expect(api.recordFocus).toHaveBeenLastCalledWith('h1', 'focus.completed', 1500, 300);
  });

  it('finishes early when "done my work" is said, and only then', async () => {
    const handlers: { text?: (t: string) => void; end?: () => void } = {};
    speech.mockReturnValue({
      start: jest.fn(async (_o, text, end) => {
        handlers.text = text;
        handlers.end = end;
        return true;
      }),
      stop: jest.fn(),
    });
    const { onLog } = await open();
    await press('Start 25 minutes');
    const mic = screen.getByRole('button', { name: 'Hold and say done my work' });
    await fireEvent(mic, 'pressIn');
    await act(async () => {
      handlers.text?.('how long is left');
      handlers.end?.();
    });
    expect(onLog).not.toHaveBeenCalled();
    expect(screen.getByText(/Heard “how long is left”/)).toBeTruthy();
    await fireEvent(mic, 'pressIn');
    await act(async () => {
      handlers.text?.('done my work');
      handlers.end?.();
    });
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 'h1' }), 'full');
  });

  it('pins the phone while running, so it never leaves the app, and unpins for a pause or a question', async () => {
    lock.isPinned.mockReturnValue(false);
    await open();
    expect(lock.start).not.toHaveBeenCalled();
    await press('Start 25 minutes');
    expect(lock.start).toHaveBeenCalledWith('h1', 'Read', 'Read 30 pages', 25, Date.now() + 25 * 60_000);
    expect(lock.pin).toHaveBeenCalled();
    await press('Pause');
    expect(lock.pause).toHaveBeenCalledWith(25 * 60_000);
    expect(lock.unpin).toHaveBeenCalled();
    await press('Resume');
    await press('Stop');
    expect(lock.stop).toHaveBeenCalled();
    lock.stop.mockClear();
    lock.unpin.mockClear();
    await screen.unmount();
    expect(lock.stop).toHaveBeenCalled();
    expect(lock.unpin).toHaveBeenCalled();
  });

  it('treats Android\'s unpin gesture as Stop', async () => {
    lock.isPinned.mockReturnValue(true);
    await open();
    await press('Start 25 minutes');
    await wait(500);
    lock.isPinned.mockReturnValue(false);
    await wait(500);
    expect(screen.getByText('Log the minimum version?')).toBeTruthy();
  });

  it('says calmly when the phone was never pinned, and can ask again', async () => {
    lock.isPinned.mockReturnValue(false);
    await open();
    await press('Start 25 minutes');
    expect(screen.queryByText(/isn't pinned/)).toBeNull();
    await wait(9000);
    expect(screen.getByText(/isn't pinned, so other apps can still open/)).toBeTruthy();
    lock.pin.mockClear();
    await press('Pin again');
    expect(lock.pin).toHaveBeenCalled();
    await press('Open pinning settings');
    expect(lock.openPinningSettings).toHaveBeenCalled();
  });

  it('follows Pause and Resume tapped in the notification', async () => {
    await open();
    await press('Start 25 minutes');
    await wait(60_000);
    lock.status.mockReturnValue({ habitId: 'h1', title: 'Read', minutes: 25, endAt: 0, paused: true, remainingMs: 24 * 60_000, timeUp: false });
    await wait(500);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    lock.status.mockReturnValue({ habitId: 'h1', title: 'Read', minutes: 25, endAt: 0, paused: false, remainingMs: 0, timeUp: false });
    await wait(500);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('acts on Stop and Done tapped in the notification, from the lock screen too', async () => {
    const saved = { habitId: 'h1', title: 'Read', minutes: 25, endAt: 0, paused: true, remainingMs: 20 * 60_000, timeUp: false };
    const { onLog } = await open();
    await press('Start 25 minutes');
    lock.status.mockReturnValue({ ...saved, pending: 'stop' });
    await wait(500);
    expect(lock.clearPending).toHaveBeenCalled();
    expect(screen.getByText('Log the minimum version?')).toBeTruthy();
    lock.status.mockReturnValue(null);
    await press('Keep going');
    lock.status.mockReturnValue({ ...saved, pending: 'done' });
    await wait(500);
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 'h1' }), 'full');
  });

  it('notices once when pausing locks the phone, and says how to turn that off', async () => {
    await open();
    await press('Start 25 minutes');
    await press('Pause');
    await wait(2000);
    // This phone takes a couple of seconds to lock.
    lock.isLocked.mockReturnValue(true);
    await wait(600);
    lock.isLocked.mockReturnValue(false);
    expect(screen.getByText(/Pausing locked your phone/)).toBeTruthy();
    await press('Open settings');
    expect(lock.openPinningSettings).toHaveBeenCalled();
    await press('Got it');
    expect(screen.queryByText(/Pausing locked your phone/)).toBeNull();
  });

  it('says nothing about locking when the phone was already locked, as on the lock screen', async () => {
    lock.isLocked.mockReturnValue(true);
    await open();
    await press('Start 25 minutes');
    await press('Pause');
    await wait(1500);
    expect(screen.queryByText(/Pausing locked your phone/)).toBeNull();
    lock.isLocked.mockReturnValue(false);
  });

  it('resumes and pins again when Resume in the notification brings the app back', async () => {
    await open();
    await press('Start 25 minutes');
    await press('Pause');
    lock.pin.mockClear();
    lock.isPinned.mockReturnValue(false);
    // The notification's Resume restarts the phone's timer, then opens the app.
    lock.status.mockReturnValue({ habitId: 'h1', title: 'Read', minutes: 25, endAt: Date.now() + 25 * 60_000, paused: false, remainingMs: 0, timeUp: false });
    await wait(500);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(lock.pin).toHaveBeenCalled();
    lock.isPinned.mockReturnValue(true);
    lock.status.mockReturnValue(null);
  });

  it('pins again whenever the app comes back while the timer runs', async () => {
    const listeners: ((state: string) => void)[] = [];
    const addListener = AppState.addEventListener as jest.Mock;
    const original = addListener.getMockImplementation();
    addListener.mockImplementation((_, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() };
    });
    try {
      await open();
      await press('Start 25 minutes');
      lock.pin.mockClear();
      lock.isPinned.mockReturnValue(false);
      await act(async () => listeners.forEach((l) => l('active')));
      expect(lock.pin).toHaveBeenCalled();
    } finally {
      addListener.mockImplementation(original);
      lock.isPinned.mockReturnValue(true);
    }
  });

  it('asks only for notifications, so the countdown can show', async () => {
    const reminders = jest.requireMock('../services/reminders');
    reminders.notificationsAllowed.mockResolvedValueOnce(false);
    await open();
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Start 25 minutes' }).props.accessibilityState?.disabled).toBe(true);
    await press('Allow notifications');
    expect(reminders.askForNotifications).toHaveBeenCalled();
    expect(screen.getByText(/Calls and emergency calls always get through/)).toBeTruthy();
  });

  it('picks up a session the phone kept going while the app was closed', async () => {
    const now = Date.now();
    await open({}, { minutes: 25, endAt: now + 10 * 60_000, paused: false, remainingMs: 0, timeUp: false });
    expect(screen.getByText('10:00')).toBeTruthy();
    await screen.unmount();
    await open({}, { minutes: 25, endAt: now - 1000, paused: false, remainingMs: 0, timeUp: true });
    expect(screen.getByText("Time's up. Is Read done?")).toBeTruthy();
  });

  it('never logs twice when the habit was already done', async () => {
    const { onLog } = await open({ status: 'done', level_done: 'full' });
    await press('Start 25 minutes');
    await wait(25 * 60_000);
    await press("Yes, it's done");
    expect(onLog).not.toHaveBeenCalled();
    expect(api.recordFocus).toHaveBeenCalledWith('h1', 'focus.completed', 1500, 1500);
  });

  it('pauses without losing time', async () => {
    await open();
    await press('Start 25 minutes');
    await wait(5 * 60_000);
    await press('Pause');
    await wait(60 * 60_000);
    expect(screen.getByText('20:00')).toBeTruthy();
    await press('Resume');
    await wait(60_000);
    expect(screen.getByText('19:00')).toBeTruthy();
  });

  it('asks about the minimum version when stopped early, and logs it on Yes', async () => {
    const { onLog, onClose } = await open();
    await press('Start 25 minutes');
    await wait(10 * 60_000);
    await press('Stop');
    expect(screen.getByText('Log the minimum version?')).toBeTruthy();
    await press('Yes');
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 'h1' }), 'minimum');
    expect(api.recordFocus).toHaveBeenLastCalledWith('h1', 'focus.stopped', 1500, 600);
    await wait(250);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('logs nothing on No, and can keep going instead', async () => {
    const { onLog } = await open();
    await press('Start 25 minutes');
    await wait(60_000);
    await press('Stop');
    await press('Keep going');
    expect(screen.getByText('24:00')).toBeTruthy();
    await press('Stop');
    await press('No');
    expect(onLog).not.toHaveBeenCalled();
    expect(api.recordFocus).toHaveBeenLastCalledWith('h1', 'focus.stopped', 1500, 60);
  });

  it('holds the app’s notifications while focusing, and shows them after', async () => {
    await open();
    expect(isHolding()).toBe(false);
    await press('Start 25 minutes');
    expect(isHolding()).toBe(true);
    await press('Stop');
    await press('No');
    await screen.unmount();
    expect(isHolding()).toBe(false);
    expect(showHeldNotifications).toHaveBeenCalledWith([]);
  });

  it('keeps focusing if the history cannot be written', async () => {
    api.recordFocus.mockRejectedValueOnce(new Error('offline'));
    await open();
    await press('Start 25 minutes');
    await wait(1000);
    expect(screen.getByText('24:59')).toBeTruthy();
  });

  it('steps out with Back: closes before starting, asks while running', async () => {
    const back = jest.spyOn(BackHandler, 'addEventListener');
    const { onClose } = await open();
    await press('Start 25 minutes');
    await act(async () => {
      (back.mock.calls.at(-1)?.[1] as () => boolean)();
    });
    expect(screen.getByText('Log the minimum version?')).toBeTruthy();
    await screen.unmount();
    const second = await open();
    await act(async () => {
      (back.mock.calls.at(-1)?.[1] as () => boolean)();
    });
    await wait(250);
    expect(second.onClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
