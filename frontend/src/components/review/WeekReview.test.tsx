import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@habit-tracker/ui';
import { WeekReview } from './WeekReview';

const api = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listHabitsInRange: vi.fn(),
  getDayStatuses: vi.fn(),
  getStreaks: vi.fn(),
  getReflection: vi.fn(),
  saveReflection: vi.fn(),
}));

vi.mock('../../services/tracker', () => ({ tracker: api }));
vi.mock('../../services/live', () => ({ watchMyActivity: () => () => {} }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } }, loading: false }),
}));

const open = async () => {
  render(
    <ThemeProvider forced="light">
      <WeekReview />
    </ThemeProvider>
  );
  await screen.findByText('Week of 9 Nov');
};

describe('WeekReview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-11T12:00:00Z'), toFake: ['Date'] });
    api.getProfile.mockResolvedValue({ timezone: 'UTC', mode: 'grace' });
    api.listHabitsInRange.mockResolvedValue([
      {
        id: 'h1',
        identity_id: 'i1',
        title: 'Run',
        identities: { name: 'The Athlete', colour_token: 'identity-1' },
        habit_levels: [],
        habit_logs: [{ id: 'l', habit_id: 'h1', date: '2026-11-09', status: 'done', level_done: 'full' }],
      },
    ]);
    api.getDayStatuses.mockResolvedValue([
      { habit_id: 'h1', date: '2026-11-09', status: 'done', repair_on: null },
      { habit_id: 'h1', date: '2026-11-10', status: 'missed', repair_on: null },
    ]);
    api.getStreaks.mockResolvedValue([]);
    api.getReflection.mockResolvedValue(null);
    api.saveReflection.mockResolvedValue(null);
  });

  it('summarises the week with no console errors', async () => {
    const errors = vi.spyOn(console, 'error');
    await open();
    expect(screen.getByText('1 of 2 days')).toBeTruthy();
    expect(screen.getByText('The Athlete')).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });

  it('saves wins, the mood line and the note, dropping blanks', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Win 1'), { target: { value: ' Ran twice ' } });
    fireEvent.change(screen.getByLabelText('One line on how the week felt'), { target: { value: 'Steady' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveReflection).toHaveBeenCalledWith('u1', {
        week_start: '2026-11-09',
        wins: ['Ran twice'],
        mood_line: 'Steady',
        month_note: null,
      })
    );
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('loads a saved reflection', async () => {
    api.getReflection.mockResolvedValue({
      week_start: '2026-11-09',
      wins: ['First'],
      mood_line: 'Calm',
      month_note: null,
    });
    await open();
    await waitFor(() =>
      expect((screen.getByLabelText('Win 1') as HTMLInputElement).value).toBe('First')
    );
  });

  it('keeps what was typed when saving fails', async () => {
    api.saveReflection.mockRejectedValue(new Error('offline'));
    await open();
    fireEvent.change(screen.getByLabelText('Win 1'), { target: { value: 'Keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('offline')).toBeTruthy();
    expect((screen.getByLabelText('Win 1') as HTMLInputElement).value).toBe('Keep me');
  });

  it('never moves past the current week', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Next week' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('can look back a week', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(await screen.findByText('Week of 2 Nov')).toBeTruthy();
  });
});
