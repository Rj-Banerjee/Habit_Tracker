import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@habit-tracker/ui';
import { useNeedsOnboarding } from '../hooks/useNeedsOnboarding';
import { setDailyReminder } from '../services/reminders';
import { tracker } from '../services/tracker';
import { OnboardingScreen } from './OnboardingScreen';

jest.mock('../services/tracker', () => ({
  tracker: {
    createHabit: jest.fn(),
    getHabit: jest.fn(),
    setReminderTime: jest.fn(),
    finishOnboarding: jest.fn(),
    getProfile: jest.fn(),
    listProgressHabits: jest.fn(),
  },
}));
jest.mock('../services/reminders', () => ({ setDailyReminder: jest.fn() }));

const api = tracker as jest.Mocked<typeof tracker>;
const reminder = setDailyReminder as jest.Mock;
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

const toHabits = async () => {
  await open();
  await press('The Reader');
  await press('Next');
};

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
    api.setReminderTime.mockResolvedValue(undefined as never);
    api.finishOnboarding.mockResolvedValue(undefined as never);
    reminder.mockResolvedValue('set');
  });

  describe('identity', () => {
    it('needs one before moving on', async () => {
      await open();
      await press('Next');
      expect(screen.getByText('Choose one, or write your own')).toBeTruthy();
      expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    });

    it('takes their own words', async () => {
      await open();
      await type('Or write your own', 'The Gardener');
      await press('Next');
      expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    });

    it('suggests a habit that fits', async () => {
      await toHabits();
      expect(screen.getByLabelText('Habit 1').props.placeholder).toBe('Read');
    });
  });

  describe('habits', () => {
    it('needs a name and a minimum version', async () => {
      await toHabits();
      await press('Next');
      expect(screen.getByText('Give the habit a name')).toBeTruthy();
      expect(api.createHabit).not.toHaveBeenCalled();
    });

    it('stops at three', async () => {
      await toHabits();
      await press('Add another habit');
      await press('Add another habit');
      expect(screen.getByLabelText('Habit 3')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Add another habit' })).toBeNull();
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
      expect(screen.getByText('Step 3 of 4')).toBeTruthy();
    });

    it('asks for the rest of a half-filled one', async () => {
      await toHabits();
      await fillFirst();
      await press('Add another habit');
      await type('Habit 2', 'Run');
      await press('Next');
      expect(api.createHabit).not.toHaveBeenCalled();
    });

    it('saves the identity with the first habit, and uses it for the rest', async () => {
      await toHabits();
      await fillFirst();
      await press('Add another habit');
      await type('Habit 2', 'Run');
      await type('Minimum version of habit 2', 'Shoes on');
      await press('Next');
      expect(api.createHabit.mock.calls[0][1]).toMatchObject({ name: 'The Reader' });
      expect(api.createHabit.mock.calls[1][0]).toMatchObject({ identityId: 'i1', title: 'Run' });
      expect(api.createHabit.mock.calls[1][1]).toBeUndefined();
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
      expect(screen.getByText('Step 3 of 4')).toBeTruthy();
    });

    it('goes back with their words kept', async () => {
      await toHabits();
      await fillFirst();
      await press('Back');
      await press('Next');
      expect(screen.getByLabelText('Habit 1').props.value).toBe('Read');
    });
  });

  describe('reminder', () => {
    it('sets the chosen time', async () => {
      await toReminder();
      await press('08:00');
      await press('Next');
      expect(api.setReminderTime).toHaveBeenCalledWith('u1', '08:00');
      expect(reminder).toHaveBeenCalledWith('08:00');
    });

    it('takes a time of their own', async () => {
      await toReminder();
      await type('Or choose your own time', '6:45');
      await press('Next');
      expect(api.setReminderTime).toHaveBeenCalledWith('u1', '06:45');
    });

    it('points out a time it cannot read', async () => {
      await toReminder();
      await type('Or choose your own time', 'soon');
      expect(screen.getByText('Use a time like 7:30 or 19:00')).toBeTruthy();
    });

    it('can go without one', async () => {
      await toReminder();
      await press('No reminder');
      await press('Next');
      expect(api.setReminderTime).toHaveBeenCalledWith('u1', null);
    });

    it('carries on, and says so, if notifications are refused', async () => {
      reminder.mockResolvedValue('denied');
      await toReminder();
      await press('Next');
      expect(screen.getByText(/Notifications are off/)).toBeTruthy();
      expect(screen.getByText('Step 4 of 4')).toBeTruthy();
    });
  });

  describe('rules', () => {
    const toRules = async () => {
      await toReminder();
      await press('Next');
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
    expect(screen.queryByText('Step 3 of 4')).toBeNull();
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
