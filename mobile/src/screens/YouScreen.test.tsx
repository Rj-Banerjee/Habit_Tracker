import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@habit-tracker/ui';
import { openPhoneSettings, sendTestReminder, syncHabitReminders } from '../services/reminders';
import { setNudgesEnabled } from '../services/nudges';
import { supabase } from '../services/supabase';
import { tracker } from '../services/tracker';
import { YouScreen } from './YouScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../services/supabase', () => ({
  supabase: { auth: { signOut: jest.fn() } },
}));
jest.mock('../services/nudges', () => ({
  nudgesEnabled: jest.fn(() => Promise.resolve(true)),
  setNudgesEnabled: jest.fn(() => Promise.resolve()),
}));
jest.mock('../services/tracker', () => ({
  tracker: {
    listCompletedHabits: jest.fn(() => Promise.resolve([])),
    restartHabit: jest.fn(() => Promise.resolve('h10')),
    markTipSeen: jest.fn(() => Promise.resolve()),
    getProfile: jest.fn(() => Promise.resolve({ reminder_time: '20:00:00' })),
    setReminderTime: jest.fn(() => Promise.resolve()),
    listIdentities: jest.fn(() =>
      Promise.resolve([{ id: 'i1', name: 'The Reader', why_text: 'Calmer evenings' }])
    ),
    updateIdentityWhy: jest.fn(() => Promise.resolve()),
    getToday: jest.fn(() => Promise.resolve([])),
  },
}));
jest.mock('../services/reminders', () => ({
  ...jest.requireActual('../services/reminders'),
  syncHabitReminders: jest.fn(() => Promise.resolve({ status: 'set' })),
  sendTestReminder: jest.fn(() => Promise.resolve({ status: 'set' })),
  openPhoneSettings: jest.fn(),
}));

const signOut = supabase.auth.signOut as jest.Mock;
const onSignedOut = jest.fn();

const open = async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <YouScreen userId="u1" email="me+test@example.test" onSignedOut={onSignedOut} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(async () => {});
};

const press = async (name: string) => {
  await fireEvent.press(screen.getByRole('button', { name }));
  await act(async () => {});
};

describe('YouScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
  });

  it('shows the signed-in email', async () => {
    await open();
    expect(screen.getByText('me+test@example.test')).toBeTruthy();
  });

  it('keeps the voice test out of normal builds', async () => {
    await open();
    expect(screen.queryByText('Voice test (test builds only)')).toBeNull();
  });

  it('offers System, Light and Dark, applied at once', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'System', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByRole('button', { name: 'Dark', selected: true })).toBeTruthy();
  });

  it('lists completed habits, and restarts one as a new run', async () => {
    (tracker.listCompletedHabits as jest.Mock).mockResolvedValue([
      {
        habit_id: 'h9', title: 'Read', identity_name: 'The Reader', colour_token: 'identity-1',
        starts_on: '2026-10-01', ends_on: '2026-10-30', frequency: 'days', days_done: 24,
        best_streak: 12, total_amount: 260, unit: 'pages', restarted: false,
      },
    ]); // prettier-ignore
    await open();
    await act(async () => {});
    expect(screen.getByText('Completed habits')).toBeTruthy();
    expect(screen.getByText('24 days done, best streak 12 days, 260 pages in all.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Restart Read' }));
    await act(async () => {});
    expect(tracker.restartHabit).toHaveBeenCalledWith('h9');
    expect(screen.getByText('Read starts again today. Its earlier run is kept.')).toBeTruthy();
  });

  it('explains that each habit reminds at its own time, and turns them on', async () => {
    await open();
    expect(screen.getByText(/Each habit reminds you at its own time/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on reminders' }));
    await act(async () => {});
    expect(syncHabitReminders).toHaveBeenCalledWith({ ask: true });
    expect(screen.getByText('Reminders are on. Each habit reminds you at its own time.')).toBeTruthy();
  });

  it('says so when notifications are off', async () => {
    (syncHabitReminders as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on reminders' }));
    await act(async () => {});
    expect(screen.getByText(/aren't allowed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open phone settings' })).toBeTruthy();
  });

  it('shows the real reason when reminders fail', async () => {
    (sendTestReminder as jest.Mock).mockResolvedValueOnce({
      status: 'unavailable',
      detail: 'Cannot find native module',
    });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Send a test reminder' }));
    await act(async () => {});
    expect(screen.getByText(/Cannot find native module/)).toBeTruthy();
  });

  it('sends a test and says so', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Send a test reminder' }));
    await act(async () => {});
    expect(screen.getByText(/test reminder is on its way/)).toBeTruthy();
  });

  it('puts an open habit on the test reminder, so its buttons can be tried', async () => {
    (tracker.getToday as jest.Mock).mockResolvedValueOnce([
      { habit_id: 'h1', title: 'Read', status: 'pending', is_today: true },
    ]);
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Send a test reminder' }));
    await act(async () => {});
    expect(sendTestReminder).toHaveBeenCalledWith({ id: 'h1', title: 'Read' });
  });

  it("offers the phone's settings once it won't ask again", async () => {
    (sendTestReminder as jest.Mock).mockResolvedValueOnce({ status: 'blocked' });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Send a test reminder' }));
    await act(async () => {});
    await fireEvent.press(screen.getByRole('button', { name: 'Open phone settings' }));
    expect(openPhoneSettings).toHaveBeenCalled();
  });

  it('shows and saves why an identity matters', async () => {
    await open();
    const field = screen.getByLabelText('Why The Reader matters');
    expect(field.props.value).toBe('Calmer evenings');
    await fireEvent.changeText(field, 'For my kids');
    await fireEvent.press(screen.getByRole('button', { name: 'Save why' }));
    await act(async () => {});
    expect(tracker.updateIdentityWhy).toHaveBeenCalledWith('i1', 'For my kids');
  });

  it('turns nudges off', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'On', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    await act(async () => {});
    expect(setNudgesEnabled).toHaveBeenCalledWith(false);
  });

  it('asks before signing out', async () => {
    await open();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText('Sign out?')).toBeTruthy();
  });

  it('stays signed in on Stay signed in', async () => {
    await open();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    await press('Stay signed in');
    expect(signOut).not.toHaveBeenCalled();
  });

  const confirm = async () => {
    await fireEvent.press(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    const options = screen.getAllByRole('button', { name: 'Sign out' });
    await fireEvent.press(options[options.length - 1]);
    await act(async () => {});
  };

  it('signs out', async () => {
    await open();
    await confirm();
    expect(signOut).toHaveBeenCalledWith();
    expect(onSignedOut).toHaveBeenCalled();
  });

  it('still forgets the session on this phone when offline', async () => {
    signOut.mockResolvedValueOnce({ error: new Error('offline') });
    await open();
    await confirm();
    expect(signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(onSignedOut).toHaveBeenCalled();
  });
});
