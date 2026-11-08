import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Connection } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { EntitlementsProvider } from '../hooks/useEntitlements';
import { tracker } from '../services/tracker';
import { ConnectionCards } from './ConnectionCards';

jest.mock('../services/tracker', () => ({
  tracker: {
    getPlan: jest.fn(),
    getConnections: jest.fn(),
    answerConnection: jest.fn(),
    applyConnectionFix: jest.fn(),
    undoAiChange: jest.fn(),
  },
}));

const api = tracker as jest.Mocked<typeof tracker>;

const link: Connection = {
  id: 'f1',
  kind: 'after_big_amount',
  key: 'after_big_amount:run:study',
  subjects: [
    { type: 'habit', id: 'run', title: 'Run' },
    { type: 'habit', id: 'study', title: 'Study' },
  ],
  direction: 'competes',
  effect: -0.44,
  sample: 82,
  confidence: 'high',
  range_from: '2026-08-11',
  range_to: '2026-11-08',
  numbers: { after_big: 43, otherwise: 87 },
  explanation: 'After Run of 16 km or more, you complete Study 43% of the time, against 87% otherwise. They seem linked.',
  question: 'Does a big Run leave less room for Study the next day?',
  fixes: [
    { label: "Make Study's goal the minimum the day after Run", habit_id: 'study', action: { type: 'minimum_after', after_habit_id: 'run' } },
    { label: 'Switch Run to 4 times a week', habit_id: 'run', action: { type: 'switch_per_week', per_week: 4 } },
  ],
  answer: null,
};

const open = async (props: Partial<React.ComponentProps<typeof ConnectionCards>> = {}) => {
  const onChanged = jest.fn();
  await render(
    <ThemeProvider forced="light">
      <EntitlementsProvider>
        <ConnectionCards habitId={null} onChanged={onChanged} {...props} />
      </EntitlementsProvider>
    </ThemeProvider>
  );
  await act(async () => {});
  return onChanged;
};

describe('ConnectionCards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getPlan.mockResolvedValue('pro');
    api.getConnections.mockResolvedValue([link]);
    api.answerConnection.mockResolvedValue(undefined as never);
    api.applyConnectionFix.mockResolvedValue('change-1');
    api.undoAiChange.mockResolvedValue(undefined as never);
  });

  it('explains a link with its real numbers and how much was measured', async () => {
    await open();
    expect(screen.getByText(link.explanation!)).toBeTruthy();
    expect(screen.getByText('Measured over 82 days, a clear pattern.')).toBeTruthy();
  });

  it('asks Yes, No or Not sure, and says what the answer does', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'No' }));
    expect(api.answerConnection).toHaveBeenCalledWith('f1', 'no');
    expect(screen.getByText("Thanks. It won't come up again for 60 days.")).toBeTruthy();
    // A link they said No to offers no fixes.
    expect(screen.queryByRole('button', { name: /Switch Run/ })).toBeNull();
  });

  it('applies a fix only after confirming, then offers Undo', async () => {
    const onChanged = await open();
    await fireEvent.press(screen.getByRole('button', { name: "Make Study's goal the minimum the day after Run" }));
    expect(api.applyConnectionFix).not.toHaveBeenCalled();
    expect(screen.getByText(/starts from today, and can be undone/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, do it' }));
    expect(api.applyConnectionFix).toHaveBeenCalledWith('f1', 0);
    expect(onChanged).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(api.undoAiChange).toHaveBeenCalledWith('change-1');
  });

  it("asks a habit's own links", async () => {
    await open({ habitId: 'study' });
    expect(api.getConnections).toHaveBeenCalledWith('study');
  });

  it('says nothing on Free, where the insights card already explains Pro', async () => {
    api.getPlan.mockResolvedValue('free');
    await open();
    expect(api.getConnections).not.toHaveBeenCalled();
    expect(screen.queryByTestId('connection-card')).toBeNull();
  });

  it('calmly says so when a fix fails', async () => {
    api.applyConnectionFix.mockRejectedValue(new Error('offline'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Switch Run to 4 times a week' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, do it' }));
    expect(screen.getByText("That didn't go through. Nothing was changed.")).toBeTruthy();
  });
});
