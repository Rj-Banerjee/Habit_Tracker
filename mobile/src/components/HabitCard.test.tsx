import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemeProvider } from '../theme/ThemeProvider';
import { layout } from '../theme/tokens';
import { HabitCard } from './HabitCard';
import { HabitCardStatus, statusLabels } from './habitCardStatus';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const renderCard = (status: HabitCardStatus, props = {}) =>
  render(
    <ThemeProvider forced="light">
      <HabitCard title="Deep work" status={status} identity="identity-1" streak={12} {...props} />
    </ThemeProvider>
  );

const allStatuses = Object.keys(statusLabels) as HabitCardStatus[];

describe('HabitCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(allStatuses)('announces the %s state to screen readers', async (status) => {
    await renderCard(status);
    expect(
      screen.getByRole('button', { name: `Deep work, ${statusLabels[status]}, 12 day streak` })
    ).toBeTruthy();
  });

  it('gives every state different wording, so none relies on colour', () => {
    expect(new Set(Object.values(statusLabels)).size).toBe(allStatuses.length);
  });

  it('never uses blaming language for a miss', () => {
    expect(statusLabels.missed).not.toMatch(/fail|missed|broke|lost/i);
  });

  it('shows no streak at all when it is zero, so a gap is never a score', async () => {
    await renderCard('missed', { streak: 0 });
    expect(screen.getByRole('button', { name: 'Deep work, Not logged' })).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('meets the 48px touch target', async () => {
    await renderCard('due');
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(layout.minTouchTarget);
  });

  it('calls onPress on tap and onLongPress on long press', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await renderCard('due', { onPress, onLongPress });
    await fireEvent.press(screen.getByRole('button'));
    await fireEvent(screen.getByRole('button'), 'longPress');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('gives a haptic tick when a habit becomes logged', async () => {
    const view = await renderCard('due');
    await view.rerender(
      <ThemeProvider forced="light">
        <HabitCard title="Deep work" status="done" identity="identity-1" streak={13} />
      </ThemeProvider>
    );
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('uses the native driver on phones', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const view = await renderCard('due');
    await view.rerender(
      <ThemeProvider forced="light">
        <HabitCard title="Deep work" status="done" identity="identity-1" streak={13} />
      </ThemeProvider>
    );
    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0][1]).toMatchObject({ useNativeDriver: true });
    timing.mockRestore();
  });

  it('gives no haptic tick when already logged, or when undone', async () => {
    const view = await renderCard('done');
    await view.rerender(
      <ThemeProvider forced="light">
        <HabitCard title="Deep work" status="due" identity="identity-1" streak={12} />
      </ThemeProvider>
    );
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
