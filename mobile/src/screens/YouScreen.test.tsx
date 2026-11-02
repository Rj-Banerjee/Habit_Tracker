import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@habit-tracker/ui';
import { openPhoneSettings, sendTestReminder, setDailyReminder } from '../services/reminders';
import { supabase } from '../services/supabase';
import { tracker } from '../services/tracker';
import { YouScreen } from './YouScreen';

jest.mock('../services/supabase', () => ({
  supabase: { auth: { signOut: jest.fn() } },
}));
jest.mock('../services/tracker', () => ({
  tracker: {
    getProfile: jest.fn(() => Promise.resolve({ reminder_time: '20:00:00' })),
    setReminderTime: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../services/reminders', () => ({
  ...jest.requireActual('../services/reminders'),
  setDailyReminder: jest.fn(() => Promise.resolve({ status: 'set' })),
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

  it('offers System, Light and Dark, applied at once', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'System', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByRole('button', { name: 'Dark', selected: true })).toBeTruthy();
  });

  it('shows the saved reminder and changes it', async () => {
    await open();
    expect(screen.getByRole('button', { name: '20:00', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '07:00' }));
    await act(async () => {});
    expect(tracker.setReminderTime).toHaveBeenCalledWith('u1', '07:00');
    expect(setDailyReminder).toHaveBeenCalledWith('07:00');
  });

  it('turns the reminder off', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'No reminder' }));
    await act(async () => {});
    expect(setDailyReminder).toHaveBeenCalledWith(null);
  });

  it('says so when notifications are off', async () => {
    (setDailyReminder as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: '07:00' }));
    await act(async () => {});
    expect(screen.getByText(/aren't allowed/)).toBeTruthy();
  });

  it('confirms the time once the phone has it', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: '07:00' }));
    await act(async () => {});
    expect(screen.getByText('Reminder set for 07:00.')).toBeTruthy();
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

  it("offers the phone's settings once it won't ask again", async () => {
    (sendTestReminder as jest.Mock).mockResolvedValueOnce({ status: 'blocked' });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Send a test reminder' }));
    await act(async () => {});
    await fireEvent.press(screen.getByRole('button', { name: 'Open phone settings' }));
    expect(openPhoneSettings).toHaveBeenCalled();
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
