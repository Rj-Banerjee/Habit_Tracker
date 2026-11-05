import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { buildChain, Chain, DayStatus, momentKey, TodayRow } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { HabitChain } from '../hooks/useChains';
import { useMoments } from '../hooks/useMoments';
import { captionsFor, streakBeforeWeld } from './CardChain';
import { MomentChain } from './MomentChain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

const TODAY = '2026-11-12';
const days = (overrides: Record<string, [string, string?]>): DayStatus[] =>
  Array.from({ length: 11 }, (_, i) => {
    const date = `2026-11-${String(i + 2).padStart(2, '0')}`;
    const [status, repairOn] = overrides[date] ?? [date === TODAY ? 'pending' : 'done'];
    return { habit_id: 'h1', date, status, repair_on: repairOn ?? null };
  });

const cracked = buildChain(days({ '2026-11-10': ['missed', '2026-11-11'] }), [], TODAY);
const welded = buildChain(
  days({ '2026-11-10': ['repaired'] }),
  [{ date: '2026-11-11', level_done: 'full', amount: 45 }],
  TODAY
);
const graced = buildChain(days({ '2026-11-10': ['protected'] }), [], TODAY);

const row = {
  habit_id: 'h1',
  day: TODAY,
  is_today: true,
  title: 'Read',
  habit_type: 'count',
  target: 30,
  unit: 'pages',
  current_streak: 12,
  colour_token: 'identity-1',
} as TodayRow;

const fracture = { kind: 'fracture' as const, habitId: 'h1', date: '2026-11-10' };
const weld = { kind: 'weld' as const, habitId: 'h1', date: '2026-11-10' };
const grace = { kind: 'protected' as const, habitId: 'h1', date: '2026-11-10' };
const full = { reducedMotion: false, lowEnd: false };

const playing = (moment: typeof fracture | typeof weld | typeof grace) => ({
  moment,
  finished: false,
  interrupted: false,
});

async function play(chain: Chain, moment: typeof fracture | typeof weld | typeof grace, props = {}) {
  const onFinish = jest.fn();
  const onSeam = jest.fn();
  const view = await render(
    <ThemeProvider forced="light">
      <MomentChain
        chain={chain}
        moment={moment}
        identity="identity-1"
        settings={full}
        captions={captionsFor(playing(moment), chain, row)}
        onFinish={onFinish}
        onSeam={onSeam}
        {...props}
      />
    </ThemeProvider>
  );
  // The chain plays once it knows its width.
  await act(async () => {
    fireEvent(screen.getByLabelText(/^Last 7 days/), 'layout', {
      nativeEvent: { layout: { width: 300, height: 24 } },
    });
  });
  return { ...view, onFinish, onSeam };
}

describe('MomentChain', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it('cracks with one light tap, never a warning, and names the repair', async () => {
    const { onFinish } = await play(cracked, fracture);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Cracked on Tue · Repair on Wed')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(600));
    expect(onFinish).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('link', { name: 'How to repair' }));
    expect(screen.getByText('Read 45 pages on Wed')).toBeTruthy();
  });

  it('welds with a success haptic as the halves meet, then the seam counts the streak up', async () => {
    const { onFinish, onSeam } = await play(welded, weld);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(220));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(onSeam).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(330));
    expect(onSeam).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(350));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Welded. 12-day streak.')).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('shimmers a Grace Day with no haptic', async () => {
    await play(graced, grace);
    await act(async () => jest.advanceTimersByTime(300));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(screen.getByText('A Grace Day kept your streak safe.')).toBeTruthy();
  });

  it('jumps to the end when interrupted, firing what it owed once', async () => {
    const view = await play(welded, weld);
    await act(async () => jest.advanceTimersByTime(100));
    await view.rerender(
      <ThemeProvider forced="light">
        <MomentChain
          chain={welded}
          moment={weld}
          identity="identity-1"
          settings={full}
          captions={captionsFor(playing(weld), welded, row)}
          interrupted
          onFinish={view.onFinish}
          onSeam={view.onSeam}
        />
      </ThemeProvider>
    );
    expect(view.onFinish).toHaveBeenCalledTimes(1);
    expect(view.onSeam).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    // The timers it cancelled never fire again.
    await act(async () => jest.advanceTimersByTime(2000));
    expect(view.onFinish).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('only crossfades with reduced motion, in 150 ms, and still says what happened', async () => {
    const { onFinish, onSeam } = await play(welded, weld, {
      settings: { reducedMotion: true, lowEnd: false },
    });
    await act(async () => jest.advanceTimersByTime(149));
    expect(onFinish).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onSeam).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Welded. 12-day streak.')).toBeTruthy();
  });

  it('never stops a tap from reaching the card underneath', async () => {
    await play(cracked, fracture);
    const drawing = screen.getByLabelText(/^Last 7 days/);
    expect(drawing.props.pointerEvents).toBe('none');
  });

  it('plays at a quarter of the speed for review', async () => {
    const { onFinish } = await play(cracked, fracture, {
      settings: { reducedMotion: false, lowEnd: false, slow: 4 },
    });
    await act(async () => jest.advanceTimersByTime(600));
    expect(onFinish).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1800));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('streakBeforeWeld', () => {
  it('counts from the days logged after the crack', () => {
    expect(streakBeforeWeld(welded, '2026-11-10')).toBe(1);
  });
});

describe('useMoments', () => {
  const chainsWith = (chain: Chain, habitId = 'h1') => [{ habitId, chain }];

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  const settle = () => act(async () => {});

  it('never plays history on a fresh install, then plays what happens next', async () => {
    const view = await renderHook(({ chains }: { chains: HabitChain[] }) => useMoments(chains, true), {
      initialProps: { chains: chainsWith(cracked) },
    });
    await settle();
    expect(view.result.current.playing).toEqual({});
    await view.rerender({ chains: chainsWith(welded) });
    await settle();
    expect(view.result.current.playing.h1?.moment).toEqual(weld);
  });

  it('starts remembering even when there was nothing to remember', async () => {
    const plain = buildChain(days({}), [], TODAY);
    const view = await renderHook(({ chains }: { chains: HabitChain[] }) => useMoments(chains, true), {
      initialProps: { chains: chainsWith(plain) },
    });
    await settle();
    await view.rerender({ chains: chainsWith(cracked) });
    await settle();
    expect(view.result.current.playing.h1?.moment).toEqual(fracture);
  });

  it('plays a moment once, even after a restart', async () => {
    await AsyncStorage.setItem('seen-chain-moments', JSON.stringify([]));
    const once = chainsWith(cracked);
    const first = await renderHook(() => useMoments(once, true));
    await settle();
    expect(first.result.current.playing.h1?.moment).toEqual(fracture);
    const saved = JSON.parse((await AsyncStorage.getItem('seen-chain-moments')) as string);
    expect(saved).toContain(momentKey(fracture));
    await first.unmount();
    const again = await renderHook(() => useMoments(once, true));
    await settle();
    expect(again.result.current.playing).toEqual({});
  });

  it('waits for the chains before deciding', async () => {
    await AsyncStorage.setItem('seen-chain-moments', JSON.stringify([]));
    const once = chainsWith(cracked);
    const view = await renderHook(() => useMoments(once, false));
    await settle();
    expect(view.result.current.playing).toEqual({});
  });

  it('shows one welcome back for several things, and remembers them on Got it', async () => {
    await AsyncStorage.setItem('seen-chain-moments', JSON.stringify([]));
    const chains = [
      { habitId: 'h1', chain: cracked },
      { habitId: 'h2', chain: graced },
    ];
    const view = await renderHook(() => useMoments(chains, true));
    await settle();
    expect(view.result.current.playing).toEqual({});
    expect(view.result.current.welcomeBack).toHaveLength(2);
    await act(async () => view.result.current.dismissWelcomeBack());
    expect(view.result.current.welcomeBack).toEqual([]);
    const saved = JSON.parse((await AsyncStorage.getItem('seen-chain-moments')) as string);
    expect(saved).toEqual(expect.arrayContaining(['fracture:h1:2026-11-10', 'protected:h2:2026-11-10']));
  });

  it('marks an interrupted moment, and leaves a finished one alone', async () => {
    await AsyncStorage.setItem('seen-chain-moments', JSON.stringify([]));
    const once = chainsWith(cracked);
    const view = await renderHook(() => useMoments(once, true));
    await settle();
    await act(async () => view.result.current.interrupt('h1'));
    expect(view.result.current.playing.h1?.interrupted).toBe(true);
    await act(async () => view.result.current.finish('h1'));
    await act(async () => view.result.current.interrupt('h1'));
    expect(view.result.current.playing.h1?.finished).toBe(true);
  });

  it('plays nothing if it cannot remember, so nothing repeats forever', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('no storage'));
    const once = chainsWith(cracked);
    const view = await renderHook(() => useMoments(once, true));
    await settle();
    expect(view.result.current.playing).toEqual({});
  });
});
