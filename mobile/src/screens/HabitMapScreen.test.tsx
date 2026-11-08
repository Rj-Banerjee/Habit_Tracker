import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Connection } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';
import { HabitMapScreen } from './HabitMapScreen';

jest.mock('../services/tracker', () => ({
  tracker: { getConnections: jest.fn(), getPlan: jest.fn(() => Promise.resolve('pro')) },
}));

const api = tracker as jest.Mocked<typeof tracker>;
const link = (patch: Partial<Connection>): Connection => ({
  id: 'f1', kind: 'next_day', key: 'k', direction: 'competes', effect: -0.44, sample: 80, confidence: 'high',
  range_from: '2026-08-11', range_to: '2026-11-08', numbers: {}, question: null, fixes: [], answer: null,
  subjects: [{ type: 'habit', id: 'run', title: 'Run' }, { type: 'habit', id: 'study', title: 'Study' }],
  explanation: 'After Run, Study slips. They seem linked.', ...patch,
}); // prettier-ignore

const open = async () => {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider forced="light">
        <HabitMapScreen onClose={jest.fn()} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(async () => {});
};

describe('HabitMapScreen', () => {
  it('lists every link as a button too, with what it does and how strong', async () => {
    api.getConnections.mockResolvedValue([
      link({}),
      link({ id: 'f2', direction: 'helps', effect: 0.25, subjects: [{ type: 'habit', id: 'read', title: 'Read' }, { type: 'habit', id: 'walk', title: 'Walk' }] }),
    ]);
    await open();
    expect(screen.getByRole('button', { name: 'Run and Study: competes, strong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Read and Walk: helps, clear' })).toBeTruthy();
    expect(screen.getByText('Green: seems to help. Amber, dashed: seems to compete. Thicker: stronger.')).toBeTruthy();
  });

  it('teaches what it needs when there are no links yet', async () => {
    api.getConnections.mockResolvedValue([]);
    await open();
    expect(screen.getByText(/once a few weeks of your habits/)).toBeTruthy();
  });

  it('opens a link from its button', async () => {
    api.getConnections.mockResolvedValue([link({})]);
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Run and Study: competes, strong' }));
    expect(screen.queryByText('Tap a link to see its numbers and what might help.')).toBeNull();
  });

  it('says so when it cannot load', async () => {
    api.getConnections.mockRejectedValue(new Error('offline'));
    await open();
    expect(screen.getByText(/The map couldn't load/)).toBeTruthy();
  });
});
