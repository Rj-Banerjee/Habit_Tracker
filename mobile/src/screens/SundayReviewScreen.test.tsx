import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { addDays, ChatEvent, CoachError, localDate, reviewWeekStart, weekLabel } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { ai } from '../services/ai';
import { tracker } from '../services/tracker';
import { SundayReviewScreen } from './SundayReviewScreen';

jest.mock('../services/ai', () => ({ ai: { letter: jest.fn() } }));
jest.mock('../services/tracker', () => ({
  tracker: {
    getProfile: jest.fn(),
    listProgressHabits: jest.fn(),
    getHabitDays: jest.fn(),
    getReflection: jest.fn(),
    getLatestLetter: jest.fn(),
    saveReflection: jest.fn(),
  },
}));

const api = tracker as jest.Mocked<typeof tracker>;
const coach = ai as jest.Mocked<typeof ai>;
const onClose = jest.fn();
const monday = reviewWeekStart(localDate('Asia/Kolkata'));

const writes = (...items: (string | Error)[]) =>
  async function* (): AsyncGenerator<ChatEvent> {
    for (const item of items) {
      if (item instanceof Error) throw item;
      yield { type: 'text', text: item };
    }
  };

const open = async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider forced="light">
        <SundayReviewScreen userId="u1" onClose={onClose} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(async () => {});
};

const press = async (name: string) => {
  await fireEvent.press(screen.getByRole('button', { name }));
  await act(async () => {});
};

describe('SundayReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getProfile.mockResolvedValue({ timezone: 'Asia/Kolkata' } as never);
    api.listProgressHabits.mockResolvedValue([{ id: 'h1', title: 'Read' }] as never);
    api.getHabitDays.mockResolvedValue([
      { habit_id: 'h1', date: monday, status: 'done', level_done: 'full', amount: null, target: null },
    ]);
    api.getReflection.mockResolvedValue(null as never);
    api.getLatestLetter.mockResolvedValue(null as never);
    api.saveReflection.mockResolvedValue(null as never);
    coach.letter.mockImplementation(writes('Dear you,', ' keep going.'));
  });

  it('summarises the week', async () => {
    await open();
    expect(screen.getByText('1 of 1 day')).toBeTruthy();
  });

  it('reads the finished week, and names it', async () => {
    await open();
    expect(api.getHabitDays).toHaveBeenCalledWith(monday, addDays(monday, 6));
    expect(screen.getByText(weekLabel(monday))).toBeTruthy();
  });

  it('saves wins and a mood line, leaving out blanks', async () => {
    await open();
    await fireEvent.changeText(screen.getByLabelText('Win 2'), ' Read daily ');
    await fireEvent.changeText(screen.getByLabelText('How did the week feel?'), 'Good');
    await press('Save');
    expect(api.saveReflection).toHaveBeenCalledWith('u1', {
      week_start: monday,
      wins: ['Read daily'],
      mood_line: 'Good',
      month_note: null,
    });
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy();
  });

  it('brings back what was saved', async () => {
    api.getReflection.mockResolvedValue({
      week_start: monday,
      wins: ['A win'],
      mood_line: 'Calm',
      month_note: null,
    });
    await open();
    expect(screen.getByLabelText('Win 1').props.value).toBe('A win');
  });

  it('writes the letter as it arrives, from their wins and mood', async () => {
    await open();
    await fireEvent.changeText(screen.getByLabelText('Win 1'), 'Read daily');
    await press('Write my letter');
    expect(coach.letter).toHaveBeenCalledWith(monday, ['Read daily'], null);
    expect(screen.getByText('Dear you, keep going.')).toBeTruthy();
  });

  it("shows this week's letter again instead of a new one", async () => {
    api.getLatestLetter.mockResolvedValue({ week_start: monday, text: 'An earlier letter.' });
    await open();
    expect(screen.getByText('An earlier letter.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Write my letter' })).toBeNull();
  });

  it("doesn't show last week's letter", async () => {
    api.getLatestLetter.mockResolvedValue({ week_start: addDays(monday, -7), text: 'Old.' });
    await open();
    expect(screen.queryByText('Old.')).toBeNull();
  });

  it('stays calm when the letter cannot be written, and the review still saves', async () => {
    coach.letter.mockImplementation(
      writes(new CoachError('Coach is only open to test accounts for now.', 'test_only'))
    );
    await open();
    await press('Write my letter');
    expect(screen.getByText('Coach is only open to test accounts for now.')).toBeTruthy();
    await press('Save');
    expect(api.saveReflection).toHaveBeenCalled();
  });

  it('still opens if the letter cannot be read', async () => {
    api.getLatestLetter.mockRejectedValue(new Error('offline'));
    await open();
    expect(screen.getByText('1 of 1 day')).toBeTruthy();
  });

  it('offers a retry when the week fails to load', async () => {
    api.getHabitDays.mockRejectedValueOnce(new Error('offline'));
    await open();
    await press('Try again');
    expect(screen.getByText('1 of 1 day')).toBeTruthy();
  });

  it('goes back', async () => {
    await open();
    await press('Back');
    expect(onClose).toHaveBeenCalled();
  });
});
