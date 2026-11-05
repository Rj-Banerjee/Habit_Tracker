import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { TodayRow } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { isHolding } from '../services/focusHold';
import { showHeldNotifications } from '../services/reminders';
import { tracker } from '../services/tracker';
import { FocusMode } from './FocusMode';

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../services/reminders', () => ({ showHeldNotifications: jest.fn(() => Promise.resolve()) }));
jest.mock('../services/haptics', () => ({ checkOffTick: jest.fn() }));
jest.mock('../services/tracker', () => ({ tracker: { recordFocus: jest.fn(() => Promise.resolve()) } }));

const api = tracker as jest.Mocked<typeof tracker>;
const keepAwake = jest.requireMock('expo-keep-awake').useKeepAwake as jest.Mock;

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

async function open(patch: Partial<TodayRow> = {}) {
  const onLog = jest.fn();
  const onClose = jest.fn();
  const view = await render(
    <ThemeProvider forced="light">
      <FocusMode row={row(patch)} reducedMotion={false} onLog={onLog} onClose={onClose} />
    </ThemeProvider>
  );
  return { ...view, onLog, onClose };
}

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const wait = (ms: number) => act(async () => jest.advanceTimersByTime(ms));

describe('Tunnel Vision', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-05T09:00:00Z') });
    jest.clearAllMocks();
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

  it('keeps the screen on', async () => {
    await open();
    expect(keepAwake).toHaveBeenCalledWith('tunnel-vision');
  });

  it('counts down in big numbers, then logs the full version and says so', async () => {
    const { onLog } = await open();
    await press('5 minutes less');
    await press('Start 20 minutes');
    expect(api.recordFocus).toHaveBeenCalledWith('h1', 'focus.started', 1200, null);
    expect(screen.getByText('20:00')).toBeTruthy();
    await wait(60_000);
    expect(screen.getByText('19:00')).toBeTruthy();
    expect(screen.getByLabelText('19 minutes left')).toBeTruthy();
    await wait(19 * 60_000);
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 'h1' }), 'full');
    expect(api.recordFocus).toHaveBeenCalledWith('h1', 'focus.completed', 1200, 1200);
    expect(screen.getByText('Done. Nicely focused.')).toBeTruthy();
  });

  it('never logs twice when the habit was already done', async () => {
    const { onLog } = await open({ status: 'done', level_done: 'full' });
    await press('Start 25 minutes');
    await wait(25 * 60_000);
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
