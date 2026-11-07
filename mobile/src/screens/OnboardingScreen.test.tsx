import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@habit-tracker/ui';
import { useNeedsOnboarding } from '../hooks/useNeedsOnboarding';
import { syncHabitReminders } from '../services/reminders';
import { tracker } from '../services/tracker';
import { OnboardingScreen } from './OnboardingScreen';

jest.mock('../services/tracker', () => ({
  tracker: {
    createHabit: jest.fn(),
    getHabit: jest.fn(),
    listIdentities: jest.fn(),
    finishOnboarding: jest.fn(),
    getProfile: jest.fn(),
    listProgressHabits: jest.fn(),
  },
}));
jest.mock('../services/reminders', () => ({
  ...jest.requireActual('../services/reminders'),
  syncHabitReminders: jest.fn(),
}));

const api = tracker as jest.Mocked<typeof tracker>;
const reminder = syncHabitReminders as jest.Mock;
const onDone = jest.fn();

const settle = () => act(async () => {});
const press = async (name: string) => {
  await fireEvent.press(screen.getByRole('button', { name }));
  await settle();
};
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);

const open = async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider forced="light">
        <OnboardingScreen userId="u1" onDone={onDone} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

const toHabits = open;

const fillFirst = async () => {
  await type('Habit 1', 'Read');
  await type('Minimum version of habit 1', 'One page');
};

const toReminder = async () => {
  await toHabits();
  await fillFirst();
  await press('Next');
};

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.createHabit.mockResolvedValue('h1');
    api.getHabit.mockResolvedValue({ identity_id: 'i1' } as never);
    api.listIdentities.mockResolvedValue([]);
    api.finishOnboarding.mockResolvedValue(undefined as never);
    reminder.mockResolvedValue({ status: 'set' });
  });

  it('starts with habits: it never asks for an identity', async () => {
    await open();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Your first habits' })).toBeTruthy();
    expect(screen.queryByText('Who do you want to become?')).toBeNull();
  });

  describe('habits', () => {
    it('needs a name', async () => {
      await toHabits();
      await press('Next');
      expect(screen.getByText('Give the habit a name')).toBeTruthy();
      expect(api.createHabit).not.toHaveBeenCalled();
    });

    it('has no limit on habits', async () => {
      await toHabits();
      for (let i = 0; i < 4; i++) await press('Add another habit');
      expect(screen.getByLabelText('Habit 5')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Add another habit' })).toBeTruthy();
    });

    it('can take one away', async () => {
      await toHabits();
      await press('Add another habit');
      await press('Remove habit 2');
      expect(screen.queryByLabelText('Habit 2')).toBeNull();
    });

    it('ignores a slot left blank', async () => {
      await toHabits();
      await fillFirst();
      await press('Add another habit');
      await press('Next');
      expect(api.createHabit).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    });

    it('suggests a minimum for each habit, and uses it when left blank', async () => {
      await toHabits();
      await type('Habit 1', 'Read');
      expect(screen.getByLabelText('Minimum version of habit 1').props.placeholder).toBe('Read at least 2 pages');
      await press('Next');
      expect(api.createHabit.mock.calls[0][0].levels[1]).toEqual({
        level: 'minimum',
        description: 'Read at least 2 pages',
        target: 2,
      });
    });

    it('sets each habit up from the library, with its own identity', async () => {
      api.getHabit.mockResolvedValueOnce({ identity_id: 'i-reader' } as never);
      api.getHabit.mockResolvedValueOnce({ identity_id: 'i-athlete' } as never);
      await toHabits();
      await fillFirst();
      await press('Add another habit');
      await type('Habit 2', 'Run 5 km');
      await press('Add another habit');
      await type('Habit 3', 'Walk');
      await press('Next');
      expect(api.createHabit.mock.calls[0]).toEqual([
        expect.objectContaining({ title: 'Read', type: 'count', timeOfDay: 'evening' }),
        { name: 'The Reader', colourToken: 'identity-1' },
      ]);
      expect(api.createHabit.mock.calls[1]).toEqual([
        expect.objectContaining({ title: 'Run', target: 5, unit: 'km', frequency: 'per_week', perWeek: 3 }),
        { name: 'The Athlete', colourToken: 'identity-2' },
      ]);
      // A second Athlete habit joins the identity made for the first.
      expect(api.createHabit.mock.calls[2]).toEqual([expect.objectContaining({ identityId: 'i-athlete' })]);
    });

    it('uses an identity they already have', async () => {
      api.listIdentities.mockResolvedValue([{ id: 'i9', name: 'The Reader', colour_token: 'identity-4', why_text: null }]);
      await toHabits();
      await fillFirst();
      await press('Next');
      expect(api.createHabit.mock.calls[0]).toEqual([expect.objectContaining({ identityId: 'i9' })]);
    });

    it("doesn't repeat anything when retrying after a failure", async () => {
      api.createHabit.mockResolvedValueOnce('h1');
      api.createHabit.mockRejectedValueOnce(new Error("Can't reach the server."));
      await toHabits();
      await fillFirst();
      await press('Add another habit');
      await type('Habit 2', 'Run');
      await type('Minimum version of habit 2', 'Shoes on');
      await press('Next');
      expect(screen.getByText("Can't reach the server.")).toBeTruthy();
      expect(screen.getByLabelText('Habit 1').props.value).toBe('Read');
      api.createHabit.mockClear();
      await press('Next');
      expect(api.createHabit).toHaveBeenCalledTimes(1);
      expect(api.createHabit.mock.calls[0][0]).toMatchObject({ title: 'Run' });
      expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    });

    it('goes back with their words kept, without saving twice', async () => {
      await toReminder();
      await press('Back');
      expect(screen.getByLabelText('Habit 1').props.value).toBe('Read');
      await press('Next');
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });
  });

  describe('reminder', () => {
    it('turns on each habit\'s own reminders', async () => {
      await toReminder();
      expect(screen.getByText(/Each habit reminds you/)).toBeTruthy();
      await press('Turn on reminders');
      expect(reminder).toHaveBeenCalledWith({ ask: true });
      expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    });

    it('can go without', async () => {
      await toReminder();
      await press('Not now');
      expect(reminder).not.toHaveBeenCalled();
      expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    });

    it('carries on, and says so, if notifications are refused', async () => {
      reminder.mockResolvedValue({ status: 'denied' });
      await toReminder();
      await press('Turn on reminders');
      expect(screen.getByText('Step 3 of 3')).toBeTruthy();
      expect(screen.getByText(/Notifications aren't allowed/)).toBeTruthy();
    });
  });

  describe('rules', () => {
    const toRules = async () => {
      await toReminder();
      await press('Not now');
    };

    it('explains the rules, then finishes', async () => {
      await toRules();
      expect(screen.getByText('Grace Days have your back')).toBeTruthy();
      expect(onDone).not.toHaveBeenCalled();
      await press('Start');
      expect(api.finishOnboarding).toHaveBeenCalledWith('u1');
      expect(onDone).toHaveBeenCalled();
    });

    it('stays put and explains if finishing fails', async () => {
      api.finishOnboarding.mockRejectedValueOnce(new Error("Can't reach the server."));
      await toRules();
      await press('Start');
      expect(screen.getByText("Can't reach the server.")).toBeTruthy();
      expect(onDone).not.toHaveBeenCalled();
    });
  });

  it('goes back a step on the hardware back button', async () => {
    if (Platform.OS !== 'android') return;
    await toHabits();
    await act(async () => {
      (BackHandler as unknown as { mockPressBack: () => void }).mockPressBack?.();
    });
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });
});

describe('useNeedsOnboarding', () => {
  const needed = async () => {
    const { result } = await renderHook(() => useNeedsOnboarding());
    await settle();
    return result.current.needed;
  };

  beforeEach(() => {
    api.getProfile.mockResolvedValue({ onboarded_at: null } as never);
    api.listProgressHabits.mockResolvedValue([]);
  });

  it('is needed by a new account', async () => {
    expect(await needed()).toBe(true);
  });

  it('is not needed once finished', async () => {
    api.getProfile.mockResolvedValue({ onboarded_at: '2026-11-02' } as never);
    expect(await needed()).toBe(false);
  });

  it('is not needed by anyone who already has habits', async () => {
    api.listProgressHabits.mockResolvedValue([{ id: 'h1' }] as never);
    expect(await needed()).toBe(false);
  });

  it("doesn't hold anyone up when it can't tell", async () => {
    api.getProfile.mockRejectedValue(new Error('offline'));
    expect(await needed()).toBe(false);
  });
});
