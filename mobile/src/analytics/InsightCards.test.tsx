import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Insight } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { EntitlementsProvider } from '../hooks/useEntitlements';
import { tracker } from '../services/tracker';
import { InsightCards } from './InsightCards';

jest.mock('../services/tracker', () => ({
  tracker: {
    getPlan: jest.fn(),
    getInsights: jest.fn(),
    applyInsight: jest.fn(),
    undoInsight: jest.fn(),
    dismissInsight: jest.fn(),
  },
}));

const api = tracker as jest.Mocked<typeof tracker>;

const weak: Insight = {
  id: 'i1',
  habit_id: 'h1',
  kind: 'weak_weekday',
  text: 'You do Read on 40% of Wednesdays, against 85% on other days.',
  numbers: { weekday_rate: 40, other_rate: 85 },
  action: { type: 'light_day', weekday: 3 },
  applied_at: null,
};
const stronger: Insight = {
  id: 'i2',
  habit_id: 'h1',
  kind: 'getting_stronger',
  text: 'Read is getting stronger: 72 out of 100.',
  numbers: {},
  action: null,
  applied_at: null,
};

const open = async (onChanged = jest.fn()) => {
  await render(
    <ThemeProvider forced="light">
      <EntitlementsProvider>
        <InsightCards habitId="h1" titles={{ h1: 'Read' }} onChanged={onChanged} />
      </EntitlementsProvider>
    </ThemeProvider>
  );
  await act(async () => {});
  return onChanged;
};

describe('InsightCards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getPlan.mockResolvedValue('pro');
    api.getInsights.mockResolvedValue([weak, stronger]);
    api.applyInsight.mockResolvedValue(undefined as never);
    api.undoInsight.mockResolvedValue(undefined as never);
    api.dismissInsight.mockResolvedValue(undefined as never);
  });

  it("shows this habit's insights, each with the number behind it", async () => {
    await open();
    expect(api.getInsights).toHaveBeenCalledWith('h1');
    expect(screen.getAllByTestId('insight-card')).toHaveLength(2);
    expect(screen.getByText(weak.text)).toBeTruthy();
  });

  it('asks before acting, says what will change, then offers Undo', async () => {
    const onChanged = await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Make Wednesdays lighter' }));
    expect(api.applyInsight).not.toHaveBeenCalled();
    expect(screen.getByText(/On Wednesdays, Read's minimum becomes the goal/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, do it' }));
    expect(api.applyInsight).toHaveBeenCalledWith('i1');
    expect(onChanged).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(api.undoInsight).toHaveBeenCalledWith('i1');
    expect(screen.getByRole('button', { name: 'Make Wednesdays lighter' })).toBeTruthy();
  });

  it('can be cancelled without changing anything', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Make Wednesdays lighter' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.applyInsight).not.toHaveBeenCalled();
  });

  it('has no button for one that only celebrates', async () => {
    api.getInsights.mockResolvedValue([stronger]);
    await open();
    expect(screen.queryByRole('button', { name: /^Make|^Move|^Set|^Switch/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Not useful: hide this for 30 days' })).toBeTruthy();
  });

  it('hides one that is not useful', async () => {
    await open();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Not useful: hide this for 30 days' })[0]);
    expect(api.dismissInsight).toHaveBeenCalledWith('i1');
    expect(screen.queryByText(weak.text)).toBeNull();
  });

  it('says so calmly when an action fails', async () => {
    api.applyInsight.mockRejectedValue(new Error('offline'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Make Wednesdays lighter' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, do it' }));
    expect(screen.getByText("That didn't go through. Nothing was changed.")).toBeTruthy();
  });

  it('teaches what to expect when there are none yet', async () => {
    api.getInsights.mockResolvedValue([]);
    await open();
    expect(screen.getByText(/once there are a few weeks to look at/)).toBeTruthy();
  });

  it('shows Free a calm Pro card, and asks the server for nothing', async () => {
    api.getPlan.mockResolvedValue('free');
    await open();
    expect(screen.getByText('Insights are available on Pro.')).toBeTruthy();
    expect(api.getInsights).not.toHaveBeenCalled();
  });
});
