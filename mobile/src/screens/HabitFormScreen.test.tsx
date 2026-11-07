import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  BackHandler,
  Dimensions,
  Keyboard,
  KeyboardEvent,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  HabitDetail,
  Identity,
  localDate,
  space,
  TodayRow,
} from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { ai } from '../services/ai';
import { tracker } from '../services/tracker';
import { forgetSuggestions } from '../hooks/useHabitSetup';
import { HabitFormScreen } from './HabitFormScreen';
import { TodayScreen } from './TodayScreen';

jest.mock('../services/ai', () => ({ ai: { chat: jest.fn(), parseVoice: jest.fn(), suggestSetup: jest.fn() } }));
jest.mock('../hooks/useEntitlements', () => {
  const entitlements = { plan: 'free', ready: false, can: () => true };
  return {
    useEntitlements: () => entitlements,
    EntitlementsProvider: ({ children }: { children: unknown }) => children,
    __setPro: (on: boolean) => Object.assign(entitlements, on ? { plan: 'pro', ready: true } : { plan: 'free', ready: false }),
  };
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../hooks/useNudges', () => ({ useNudges: jest.fn() }));
jest.mock('../services/widget', () => ({ refreshWidget: jest.fn() }));
jest.mock('../services/live', () => ({ watchMyActivity: () => () => {} }));
jest.mock('../services/speak', () => ({ speak: jest.fn() }));
jest.mock('../voice/speech', () => ({ speechInput: () => null }));

jest.mock('../services/tracker', () => ({
  tracker: {
    listVoiceHabits: jest.fn(() => Promise.resolve([])),
    getProfile: jest.fn(() => Promise.resolve({ seen_tips: [] })),
    countActiveHabits: jest.fn(() => Promise.resolve(1)),
    markTipSeen: jest.fn(() => Promise.resolve()),
    listIdentities: jest.fn(),
    createHabit: jest.fn(),
    getHabit: jest.fn(),
    updateHabit: jest.fn(),
    archiveHabit: jest.fn(),
    getToday: jest.fn(),
    getRepairs: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const api = tracker as jest.Mocked<typeof tracker>;

const athlete: Identity = {
  id: 'i1',
  name: 'The Athlete',
  colour_token: 'identity-1',
  why_text: null,
};
const reader: Identity = {
  id: 'i2',
  name: 'The Reader',
  colour_token: 'identity-2',
  why_text: null,
};

const readHabit: HabitDetail = {
  id: 'h1',
  identity_id: 'i2',
  title: 'Read',
  type: 'count',
  target: 30,
  unit: 'pages',
  schedule_days: [1, 2, 3],
  voice_aliases: ['book'],
  milestone_amount: 300,
  milestone_label: 'book',
  time_of_day: 'evening',
  reminder_time: null,
  frequency: 'days',
  per_week: null,
  ends_on: null,
  habit_levels: [
    { level: 'full', description: 'Read', target: 30 },
    { level: 'minimum', description: 'One page', target: 1 },
    { level: 'setup', description: 'Open the book', target: null },
  ],
};

const onClose = jest.fn();

const inApp = (element: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    <ThemeProvider forced="light">{element}</ThemeProvider>
  </SafeAreaProvider>
);

const settle = () => act(async () => {});

const openForm = async (habitId?: string) => {
  await render(inApp(<HabitFormScreen habitId={habitId} onClose={onClose} />));
  await settle();
};

const button = (name: string) => screen.getByRole('button', { name });
const press = (name: string) => fireEvent.press(button(name));
const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);

const chosen = (name: string) => screen.getByRole('button', { name, selected: true });
const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
const today = () => localDate(Intl.DateTimeFormat().resolvedOptions().timeZone);
const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pro = () => require('../hooks/useEntitlements').__setPro(true);

const fillRequired = async () => {
  await type('Name', 'Run');
  await type('Minimum version', 'Run 1 km');
};

describe('HabitFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../hooks/useEntitlements').__setPro(false);
    forgetSuggestions();
    api.listIdentities.mockResolvedValue([athlete]);
    api.createHabit.mockResolvedValue('new-habit');
    api.getHabit.mockResolvedValue(readHabit);
    api.updateHabit.mockResolvedValue(undefined);
    api.archiveHabit.mockResolvedValue(undefined);
  });

  describe('loading', () => {
    it('shows only a spinner until everything has arrived', async () => {
      api.listIdentities.mockReturnValue(new Promise(() => {}));
      await openForm();
      expect(screen.getByLabelText('Loading')).toBeTruthy();
      expect(screen.queryByLabelText('Name')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });

    it('loads the habit when editing', async () => {
      await openForm('h1');
      expect(api.getHabit).toHaveBeenCalledWith('h1');
    });
  });

  describe('load failed', () => {
    it('offers a retry when identities fail, never an empty form', async () => {
      api.listIdentities.mockRejectedValueOnce(new Error('offline'));
      await openForm();
      expect(screen.getByText("This couldn't load.")).toBeTruthy();
      expect(screen.queryByLabelText('Name')).toBeNull();
      await press('Try again');
      await settle();
      expect(screen.getByLabelText('Name')).toBeTruthy();
    });

    it('offers a retry when the habit fails to load', async () => {
      api.getHabit.mockRejectedValueOnce(new Error('offline'));
      await openForm('h1');
      expect(screen.getByText("This couldn't load.")).toBeTruthy();
      await press('Back');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('no habit limit', () => {
    it('opens the form however many habits there are', async () => {
      api.countActiveHabits.mockResolvedValue(40);
      await openForm();
      expect(screen.getByLabelText('Name')).toBeTruthy();
    });

    it('shows a server refusal and keeps the form', async () => {
      api.createHabit.mockRejectedValueOnce(new Error('Choose at least one day'));
      await openForm();
      await fillRequired();
      await press('Save');
      await settle();
      expect(screen.getByText('Choose at least one day')).toBeTruthy();
      expect(screen.getByLabelText('Name').props.value).toBe('Run');
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('empty create', () => {
    it('opens blank, titled New habit, every day, anytime, with nothing to archive', async () => {
      await openForm();
      expect(screen.getByRole('header', { name: 'New habit' })).toBeTruthy();
      expect(screen.getByLabelText('Name').props.value).toBe('');
      expect(chosen('Specific days')).toBeTruthy();
      for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(chosen(day)).toBeTruthy();
      expect(chosen('Anytime')).toBeTruthy();
      expect(screen.getByRole('switch', { name: 'End this habit' }).props.accessibilityState).toMatchObject({ checked: false });
      expect(screen.queryByText(/Changes apply from today/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Archive habit' })).toBeNull();
    });

    it('never asks for the identity or the type', async () => {
      await openForm();
      expect(screen.queryByLabelText('Identity name')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Yes or no' })).toBeNull();
      expect(screen.getByText('We set these up for you')).toBeTruthy();
    });
  });

  describe('creating from the library', () => {
    it('sets up "Run 20 km" as Run with a 20 km target, 3 times a week, in the morning', async () => {
      await openForm();
      await type('Name', 'Run 20 km');
      expect(screen.getByText('Saved as Run, with a target of 20 km.')).toBeTruthy();
      expect(screen.getByLabelText('Target').props.value).toBe('20');
      expect(screen.getByLabelText('Unit').props.value).toBe('km');
      expect(chosen('Times per week')).toBeTruthy();
      expect(screen.getByText('3 times a week')).toBeTruthy();
      expect(screen.getByText(/rest days/i)).toBeTruthy();
      expect(chosen('Morning')).toBeTruthy();
      expect(screen.getByLabelText('Minimum version').props.value).toBe('Run at least 1 km');
      expect(screen.getByRole('button', { name: 'Count 1 km as the minimum', selected: true })).toBeTruthy();
      await press('Save');
      await settle();
      const [input, newIdentity] = api.createHabit.mock.calls[0];
      expect(input).toMatchObject({
        identityId: 'i1',
        title: 'Run',
        type: 'count',
        target: 20,
        unit: 'km',
        frequency: 'per_week',
        perWeek: 3,
        scheduleDays: [1, 2, 3, 4, 5, 6, 7],
        timeOfDay: 'morning',
        reminderTime: '08:00',
        endsOn: null,
      });
      expect(input.levels).toEqual([
        { level: 'full', description: 'Run', target: 20 },
        { level: 'minimum', description: 'Run at least 1 km', target: 1 },
        { level: 'setup', description: 'Put on running shoes', target: null },
      ]);
      expect(newIdentity).toBeUndefined();
      expect(onClose).toHaveBeenCalled();
    });

    it('sets up Read with 10 pages, every day, and a new identity for it', async () => {
      await openForm();
      await type('Name', 'Read');
      expect(screen.getByLabelText('Target').props.value).toBe('10');
      expect(chosen('Specific days')).toBeTruthy();
      expect(chosen('Evening')).toBeTruthy();
      expect(screen.getByLabelText('Minimum version').props.value).toBe('Read at least 2 pages');
      expect(screen.getByLabelText('Identity: The Reader. Change')).toBeTruthy();
      await press('Save');
      await settle();
      const [input, newIdentity] = api.createHabit.mock.calls[0];
      expect(input).toMatchObject({ title: 'Read', target: 10, unit: 'pages', frequency: 'days', perWeek: null });
      expect(input.levels[1]).toEqual({ level: 'minimum', description: 'Read at least 2 pages', target: 2 });
      expect(newIdentity).toEqual({ name: 'The Reader', colourToken: 'identity-2', whyText: undefined });
    });

    it('suggests names while typing', async () => {
      await openForm();
      await type('Name', 'medit');
      await press('Use Meditate');
      expect(screen.getByLabelText('Name').props.value).toBe('Meditate');
      expect(screen.getByLabelText('Target').props.value).toBe('10');
    });

    it('starts a risky goal gentler, and says so calmly', async () => {
      await openForm();
      await type('Name', 'Run 50 km');
      expect(screen.getByText('Starting at 5 km a day is easier on your body. You can raise it any time.')).toBeTruthy();
      expect(screen.getByLabelText('Target').props.value).toBe('5');
    });

    it('keeps what they changed when the name changes', async () => {
      await openForm();
      await type('Name', 'Read');
      await press('Morning');
      await type('Name', 'Read 20 pages');
      expect(chosen('Morning')).toBeTruthy();
      expect(screen.getByLabelText('Target').props.value).toBe('20');
    });

    it('lets them turn down the minimum amount', async () => {
      await openForm();
      await type('Name', 'Read');
      await press('Count 2 pages as the minimum');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0].levels[1]).toEqual({
        level: 'minimum',
        description: 'Read at least 2 pages',
        target: null,
      });
    });

    it("says when a minimum's unit can't count toward the target", async () => {
      await openForm();
      await type('Name', 'Read');
      await type('Minimum version', 'Read 2 lines');
      expect(screen.getByText("lines can't count toward pages, so this stays a description.")).toBeTruthy();
    });
  });

  describe('a habit the library does not know', () => {
    it('saves on Free from the name alone, without asking the AI', async () => {
      await openForm();
      await type('Name', 'Polish telescopes');
      expect(chosen('Anytime')).toBeTruthy();
      expect(screen.queryByLabelText('Target')).toBeNull();
      expect(screen.getByLabelText('Identity: Everyday. Change')).toBeTruthy();
      await press('Save');
      await settle();
      expect(ai.suggestSetup).not.toHaveBeenCalled();
      expect(api.createHabit.mock.calls[0][0]).toMatchObject({ title: 'Polish telescopes', type: 'boolean' });
      expect(api.createHabit.mock.calls[0][1]).toMatchObject({ name: 'Everyday' });
    });

    it('asks the AI once on Pro, after a pause, and uses its answer', async () => {
      pro();
      (ai.suggestSetup as jest.Mock).mockResolvedValue({
        type: 'count',
        target: 2,
        unit: 'items',
        frequency: 'per_week',
        per_week: 1,
        reason: 'Once a week keeps the lenses clear.',
        time_of_day: 'evening',
        minimum_text: 'Polish one lens',
        minimum_target: 1,
        setup: 'Get the cloth out',
        identity: 'The Stargazer',
        voice_aliases: ['telescope'],
      });
      await openForm();
      await type('Name', 'Polish telescopes');
      expect(screen.getByText('Finding suggestions…')).toBeTruthy();
      await wait(700);
      expect(ai.suggestSetup).toHaveBeenCalledTimes(1);
      expect(ai.suggestSetup).toHaveBeenCalledWith('Polish telescopes');
      expect(chosen('Evening')).toBeTruthy();
      expect(screen.getByText('Once a week keeps the lenses clear.')).toBeTruthy();
      expect(screen.getByLabelText('Identity: The Stargazer. Change')).toBeTruthy();
      expect(screen.queryByText('Finding suggestions…')).toBeNull();
    });

    it("doesn't ask the AI about habits the library knows", async () => {
      pro();
      await openForm();
      await type('Name', 'Read');
      await wait(700);
      expect(ai.suggestSetup).not.toHaveBeenCalled();
    });

    it('still saves when the AI is down, with the target theirs to fill in', async () => {
      pro();
      (ai.suggestSetup as jest.Mock).mockRejectedValue(new Error('down'));
      await openForm();
      await type('Name', 'Polish telescopes');
      await wait(700);
      expect(screen.queryByText('Finding suggestions…')).toBeNull();
      await press('Save');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });

    it('saves without waiting for a slow AI', async () => {
      pro();
      (ai.suggestSetup as jest.Mock).mockReturnValue(new Promise(() => {}));
      await openForm();
      await type('Name', 'Polish telescopes');
      await press('Save');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });
  });

  describe('days', () => {
    it('switches to times per week, and back to specific days', async () => {
      await openForm();
      await type('Name', 'Polish telescopes');
      await press('Times per week');
      expect(screen.getByText('3 times a week')).toBeTruthy();
      await press('Fewer, Times per week');
      await press('Fewer, Times per week');
      expect(screen.getByText('1 time a week')).toBeTruthy();
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0]).toMatchObject({ frequency: 'per_week', perWeek: 1 });
    });

    it('treats 7 a week as every day', async () => {
      await openForm();
      await type('Name', 'Polish telescopes');
      await press('Times per week');
      for (let i = 0; i < 4; i++) await press('More, Times per week');
      expect(chosen('Specific days')).toBeTruthy();
      expect(chosen('Sun')).toBeTruthy();
    });

    it('sends the chosen days', async () => {
      await openForm();
      await type('Name', 'Polish telescopes');
      await press('Sat');
      await press('Sun');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0]).toMatchObject({ frequency: 'days', scheduleDays: [1, 2, 3, 4, 5] });
    });
  });

  describe('ending a habit', () => {
    it('ends after a number of days, counted from today', async () => {
      await openForm();
      await type('Name', 'Polish telescopes');
      await fireEvent.press(screen.getByRole('switch', { name: 'End this habit' }));
      await type('Days', '3');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0].endsOn).toBe(addDays(today(), 2));
    });

    it('ends on a date, moved a day or a week at a time', async () => {
      await openForm();
      await type('Name', 'Polish telescopes');
      await fireEvent.press(screen.getByRole('switch', { name: 'End this habit' }));
      await press('On a date');
      await press('A week later');
      await press('A day earlier');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0].endsOn).toBe(addDays(today(), 35));
    });

    it('offers the length of a challenge, without turning the end on', async () => {
      await openForm();
      await type('Name', '30-day challenge');
      expect(screen.getByText('This sounds like 30 days.')).toBeTruthy();
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0].endsOn).toBeNull();
    });

    it('needs a number of days', async () => {
      await openForm();
      await type('Name', 'Polish telescopes');
      await fireEvent.press(screen.getByRole('switch', { name: 'End this habit' }));
      await type('Days', '0');
      await press('Save');
      await settle();
      expect(screen.getByText('Enter a number of days')).toBeTruthy();
      expect(api.createHabit).not.toHaveBeenCalled();
    });
  });

  describe('we set these up for you', () => {
    it('accepts everything at once', async () => {
      await openForm();
      await type('Name', 'Read');
      await press('Accept all');
      expect(screen.getByText('All set. You can change any of these later.')).toBeTruthy();
    });

    it('changes the identity to an existing one', async () => {
      api.listIdentities.mockResolvedValue([athlete, reader]);
      await openForm();
      await type('Name', 'Polish telescopes');
      await press('Identity: Everyday. Change');
      await press('The Reader');
      await press('Done');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0]).toEqual([expect.objectContaining({ identityId: 'i2' }), undefined]);
    });

    it('turns the reminder off', async () => {
      await openForm();
      await type('Name', 'Read');
      await press('Reminder: 7:00 pm. Change');
      await fireEvent.press(screen.getByRole('switch', { name: 'Remind me' }));
      await press('Done');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0].reminderTime).toBeNull();
    });

    it('changes the type, and the voice names', async () => {
      await openForm();
      await type('Name', 'Polish telescopes');
      await press('Type: Yes or no. Change');
      await press('Count');
      await press('Done');
      await type('Unit', 'lenses');
      await press('Voice names: None. Change');
      await type('Voice names', 'telescope, scope');
      await press('Done');
      await type('Target', '3');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0]).toMatchObject({
        type: 'count',
        target: 3,
        unit: 'lenses',
        voiceAliases: ['telescope', 'scope'],
      });
    });
  });

  describe('editing', () => {
    beforeEach(() => {
      api.listIdentities.mockResolvedValue([athlete, reader]);
    });

    it('opens filled in, titled Edit habit, with the type hidden', async () => {
      await openForm('h1');
      await press('More');
      expect(screen.getByRole('header', { name: 'Edit habit' })).toBeTruthy();
      expect(screen.getByLabelText('Name').props.value).toBe('Read');
      expect(screen.getByLabelText('Target').props.value).toBe('30');
      expect(screen.getByLabelText('Minimum version').props.value).toBe('One page');
      expect(screen.getByLabelText('Just set up').props.value).toBe('Open the book');
      expect(screen.queryByRole('button', { name: 'Yes or no' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Mon', selected: true })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sun', selected: false })).toBeTruthy();
    });

    it('shows the note about past days above the save button', async () => {
      await openForm('h1');
      expect(screen.getByText('Changes apply from today. Past days stay as they were.')).toBeTruthy();
    });

    it('shows the current identity selected, with the others to move to', async () => {
      await openForm('h1');
      await press('More');
      expect(screen.getByRole('button', { name: 'The Reader', selected: true })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'The Athlete', selected: false })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'New identity' })).toBeTruthy();
    });

    it('moves the habit to another identity', async () => {
      await openForm('h1');
      await press('More');
      await press('The Athlete');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', { identityId: 'i1' });
    });

    it('moves the habit to a new identity', async () => {
      await openForm('h1');
      await press('More');
      await press('New identity');
      await type('Identity name', 'The Maker');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', {
        newIdentity: { name: 'The Maker', colourToken: 'identity-3', whyText: undefined },
      });
    });

    it('needs a name before moving to a new identity', async () => {
      await openForm('h1');
      await press('More');
      await press('New identity');
      await press('Save');
      await settle();
      expect(screen.getByText('Give the identity a name')).toBeTruthy();
      expect(api.updateHabit).not.toHaveBeenCalled();
    });

    it('counts a move as an unsaved change', async () => {
      await openForm('h1');
      await press('More');
      await press('The Athlete');
      await press('Back');
      expect(screen.getByText('Discard your changes?')).toBeTruthy();
    });

    it('sends only what changed', async () => {
      await openForm('h1');
      await type('Unit', 'chapters');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', { unit: 'chapters' });
      expect(api.createHabit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('changes a schedule', async () => {
      await openForm('h1');
      await press('Mon');
      await press('Sat');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', { scheduleDays: [2, 3, 6] });
    });

    it('changes the Shrink levels', async () => {
      await openForm('h1');
      await press('More');
      await type('Minimum version', 'Two pages');
      await type('Minimum target', '2');
      await type('Just set up', '');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', {
        levels: [
          { level: 'full', description: 'Read', target: 30 },
          { level: 'minimum', description: 'Two pages', target: 2 },
        ],
      });
    });

    it('carries a rename through to a full version that only repeated the name', async () => {
      await openForm('h1');
      await type('Name', 'Read books');
      await press('Save');
      await settle();
      const [, changes] = api.updateHabit.mock.calls[0];
      expect(changes.title).toBe('Read books');
      expect(changes.levels?.[0].description).toBe('Read books');
    });

    it('leaves a separate full version alone on a rename', async () => {
      api.getHabit.mockResolvedValue({
        ...readHabit,
        habit_levels: [
          { level: 'full', description: 'Read 30 pages', target: 30 },
          { level: 'minimum', description: 'One page', target: 1 },
        ],
      });
      await openForm('h1');
      await type('Name', 'Read books');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', { title: 'Read books' });
    });

    it('returns to Today without a call when nothing changed', async () => {
      await openForm('h1');
      await press('Save');
      await settle();
      expect(api.updateHabit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('sends null to clear a saved unit', async () => {
      await openForm('h1');
      await type('Unit', '');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', { unit: null });
    });

    it('sends null to clear a saved milestone', async () => {
      await openForm('h1');
      await press('More');
      await type('Milestone amount', '');
      await type('Milestone label', '');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', {
        milestoneAmount: null,
        milestoneLabel: null,
      });
    });

    it('keeps the unit and milestone hints free of old warnings', async () => {
      await openForm('h1');
      await press('More');
      await type('Unit', '');
      await type('Milestone amount', '');
      await type('Milestone label', '');
      expect(screen.getByText('For example, 300 pages = 1 book.')).toBeTruthy();
      expect(screen.queryByText(/can't be removed/)).toBeNull();
    });

    it('still asks for both halves of a milestone', async () => {
      await openForm('h1');
      await press('More');
      await type('Milestone label', '');
      await press('Save');
      await settle();
      expect(api.updateHabit).not.toHaveBeenCalled();
    });
  });

  describe('field errors', () => {
    it('shows each problem and sends nothing', async () => {
      await openForm();
      await type('Name', 'Read');
      await type('Target', '');
      await type('Minimum version', '');
      for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await press(day);
      await type('Name', '');
      await press('Save');
      await settle();
      expect(screen.getByText('Give the habit a name')).toBeTruthy();
      expect(screen.getByText('Enter a number above 0')).toBeTruthy();
      expect(screen.getByText('Choose at least one day')).toBeTruthy();
      expect(screen.getByText('Describe the smallest version that still counts')).toBeTruthy();
      expect(api.createHabit).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('clears a problem once it is fixed', async () => {
      await openForm();
      await press('Save');
      await settle();
      await type('Name', 'Run');
      expect(screen.queryByText('Give the habit a name')).toBeNull();
    });

    it('scrolls to the first problem', async () => {
      await openForm();
      const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
      await fireEvent(screen.getByTestId('field-title'), 'layout', {
        nativeEvent: { layout: { y: 200 } },
      });
      await press('Save');
      await settle();
      expect(scrollTo).toHaveBeenCalledWith({ y: 200 - space.lg });
      scrollTo.mockRestore();
    });

    it('opens More when the problem is inside it', async () => {
      await openForm('h1');
      await press('More');
      await type('Milestone label', '');
      await press('Less');
      await press('Save');
      await settle();
      expect(screen.getByText('Name the milestone, such as "book"')).toBeTruthy();
      expect(api.updateHabit).not.toHaveBeenCalled();
    });
  });

  describe('saving', () => {
    it('disables save, keeps the fields and ignores a second press', async () => {
      let finish = () => {};
      api.createHabit.mockReturnValue(new Promise((resolve) => (finish = () => resolve('h'))));
      await openForm();
      await fillRequired();
      await press('Save');
      await settle();
      expect(button('Save').props.accessibilityState.disabled).toBe(true);
      expect(screen.getByLabelText('Name').props.value).toBe('Run');
      await press('Save');
      expect(api.createHabit).toHaveBeenCalledTimes(1);
      await act(async () => finish());
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('save failed', () => {
    it('shows the error and keeps everything typed', async () => {
      api.createHabit.mockRejectedValueOnce(new Error('Network request failed'));
      await openForm();
      await type('Name', 'Read');
      await type('Target', '30');
      await type('Minimum version', 'Read one page');
      await press('Save');
      await settle();
      expect(screen.getByText('Network request failed')).toBeTruthy();
      expect(screen.getByLabelText('Target').props.value).toBe('30');
      expect(screen.getByLabelText('Minimum version').props.value).toBe('Read one page');
      expect(button('Save').props.accessibilityState.disabled).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('works on edit too', async () => {
      api.updateHabit.mockRejectedValueOnce(new Error('Network request failed'));
      await openForm('h1');
      await type('Name', 'Read more');
      await press('Save');
      await settle();
      expect(screen.getByText('Network request failed')).toBeTruthy();
      expect(screen.getByLabelText('Name').props.value).toBe('Read more');
    });
  });

  describe('unsaved changes', () => {
    it('leaves straight away when nothing was typed', async () => {
      await openForm();
      await press('Back');
      expect(onClose).toHaveBeenCalled();
    });

    it('asks first after typing, and Keep editing keeps the text', async () => {
      await openForm();
      await type('Name', 'Run');
      await press('Back');
      expect(screen.getByText('Discard your changes?')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
      await press('Keep editing');
      expect(screen.queryByText('Discard your changes?')).toBeNull();
      expect(screen.getByLabelText('Name').props.value).toBe('Run');
    });

    it('leaves after Discard', async () => {
      await openForm();
      await type('Name', 'Run');
      await press('Back');
      await press('Discard');
      expect(onClose).toHaveBeenCalled();
    });

    it('counts a changed identity as typing', async () => {
      await openForm();
      await press('Identity: The Athlete. Change');
      await type('Or a new identity', 'The Maker');
      await press('Done');
      await press('Back');
      expect(screen.getByText('Discard your changes?')).toBeTruthy();
    });

    it("doesn't ask when a change was put back", async () => {
      await openForm('h1');
      await press('Mon');
      await press('Mon');
      await press('Back');
      expect(onClose).toHaveBeenCalled();
    });

    it('treats Android back the same way', async () => {
      const add = jest.spyOn(BackHandler, 'addEventListener');
      await openForm();
      await type('Name', 'Run');
      const handler = add.mock.calls[add.mock.calls.length - 1][1];
      await act(async () => {
        expect(handler({} as never)).toBe(true);
      });
      expect(screen.getByText('Discard your changes?')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
      add.mockRestore();
    });
  });

  describe('archive', () => {
    beforeEach(() => {
      api.listIdentities.mockResolvedValue([athlete, reader]);
    });

    it('confirms by name, then archives and returns', async () => {
      await openForm('h1');
      await press('Archive habit');
      expect(screen.getByText('Archive Read? Its history is kept.')).toBeTruthy();
      expect(api.archiveHabit).not.toHaveBeenCalled();
      await press('Archive');
      await settle();
      expect(api.archiveHabit).toHaveBeenCalledWith('h1');
      expect(onClose).toHaveBeenCalled();
    });

    it('does nothing on Keep', async () => {
      await openForm('h1');
      await press('Archive habit');
      await press('Keep');
      expect(api.archiveHabit).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('stays on the form and explains when archiving fails', async () => {
      api.archiveHabit.mockRejectedValueOnce(new Error('Network request failed'));
      await openForm('h1');
      await press('Archive habit');
      await press('Archive');
      await settle();
      expect(screen.getByText('Network request failed')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('keyboard', () => {
    afterEach(() => jest.restoreAllMocks());

    // Runs React Native's own calculation, with a 390x844 phone's real numbers.
    it('lifts the form above the keyboard', async () => {
      const listeners: Record<string, (event: KeyboardEvent) => void> = {};
      jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
        listeners[name] = listener as (event: KeyboardEvent) => void;
        return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
      });
      jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
      await openForm();

      await act(async () => {
        fireEvent(screen.getByTestId('habit-form-keyboard'), 'layout', {
          persist: () => {},
          nativeEvent: { layout: { x: 0, y: 47, width: 390, height: 763 } },
        });
      });
      await act(async () => {
        const opened = listeners.keyboardWillShow ?? listeners.keyboardDidShow;
        opened({
          duration: 0,
          endCoordinates: { screenY: 508, height: 336, screenX: 0, width: 390 },
        } as KeyboardEvent);
      });

      // The form's bottom edge is at 810 and the keyboard's top is at 508.
      expect(screen.getByTestId('habit-form-keyboard')).toHaveStyle({ paddingBottom: 302 });
    });

    it('lets a drag put the keyboard away', async () => {
      await openForm();
      expect(screen.getByTestId('habit-form').props.keyboardDismissMode).toBe(
        Platform.OS === 'ios' ? 'interactive' : 'on-drag'
      );
    });
  });

  describe('wide screens', () => {
    const phone = Dimensions.get('window');

    afterEach(() => {
      Dimensions.set({ window: phone, screen: phone });
    });

    const widen = () => {
      const desktop = { ...phone, width: 1200, height: 800 };
      Dimensions.set({ window: desktop, screen: desktop });
    };

    it('saves on Enter in the last text field', async () => {
      widen();
      await openForm();
      await fillRequired();
      await fireEvent(screen.getByLabelText('Minimum version'), 'submitEditing');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });

    it('moves Enter to the number of days when the end is open', async () => {
      widen();
      await openForm();
      await fillRequired();
      await fireEvent.press(screen.getByRole('switch', { name: 'End this habit' }));
      await type('Days', '10');
      expect(screen.getByLabelText('Minimum version').props.onSubmitEditing).toBeUndefined();
      await fireEvent(screen.getByLabelText('Days'), 'submitEditing');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });

    it('moves Enter to the last field once More is open on edit', async () => {
      widen();
      await openForm('h1');
      await press('More');
      expect(screen.getByLabelText('Minimum version').props.onSubmitEditing).toBeUndefined();
      await type('Name', 'Read more');
      await fireEvent(screen.getByLabelText('Milestone label'), 'submitEditing');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledTimes(1);
    });

    it('ignores Enter while a save is running', async () => {
      widen();
      api.createHabit.mockReturnValue(new Promise(() => {}));
      await openForm();
      await fillRequired();
      await fireEvent(screen.getByLabelText('Minimum version'), 'submitEditing');
      await fireEvent(screen.getByLabelText('Minimum version'), 'submitEditing');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });

    it("leaves Enter alone on a phone, where Done only closes the keyboard", async () => {
      await openForm();
      expect(screen.getByLabelText('Minimum version').props.onSubmitEditing).toBeUndefined();
    });

    describe('Escape', () => {
      let keyUp: (event: { key: string }) => void;

      beforeEach(() => {
        jest.replaceProperty(Platform, 'OS', 'web');
        const listen = jest.fn((_name: string, handler: typeof keyUp) => {
          keyUp = handler;
        });
        // The native test environment's window has no event methods of its own.
        Object.assign(window, { addEventListener: listen, removeEventListener: jest.fn() });
      });

      afterEach(() => jest.restoreAllMocks());

      it("doesn't touch BackHandler, which logs an error on web", async () => {
        const add = jest.spyOn(BackHandler, 'addEventListener');
        await openForm();
        expect(add).not.toHaveBeenCalled();
      });

      it('acts like Back', async () => {
        await openForm();
        await act(async () => keyUp({ key: 'Escape' }));
        expect(onClose).toHaveBeenCalled();
      });

      it('asks first after typing, and a second Escape leaves the sheet to close itself', async () => {
        await openForm();
        await type('Name', 'Run');
        await act(async () => keyUp({ key: 'Escape' }));
        expect(screen.getByText('Discard your changes?')).toBeTruthy();
        await act(async () => keyUp({ key: 'Escape' }));
        expect(screen.getByText('Discard your changes?')).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
      });

      it('ignores other keys', async () => {
        await openForm();
        await act(async () => keyUp({ key: 'a' }));
        expect(onClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('accessibility and limits', () => {
    it('names every button', async () => {
      await openForm();
      await type('Name', 'Read');
      const buttons = screen.getAllByRole('button');
      expect(screen.getAllByRole('button', { name: /\S/ })).toHaveLength(buttons.length);
    });

    it('names every button on edit', async () => {
      await openForm('h1');
      await press('More');
      const buttons = screen.getAllByRole('button');
      expect(screen.getAllByRole('button', { name: /\S/ })).toHaveLength(buttons.length);
    });

    it('holds text fields to what the database accepts', async () => {
      await openForm('h1');
      await press('More');
      expect(screen.getByLabelText('Name').props.maxLength).toBe(100);
      expect(screen.getByLabelText('Unit').props.maxLength).toBe(30);
      expect(screen.getByLabelText('Milestone label').props.maxLength).toBe(40);
    });
  });
});

describe('Today entry points', () => {
  const row: TodayRow = {
    day: '2026-11-03',
    is_today: true,
    habit_id: 'h1',
    identity_id: 'i1',
    identity_name: 'The Athlete',
    colour_token: 'identity-1',
    title: 'Run',
    habit_type: 'boolean',
    target: null,
    unit: null,
    status: 'pending',
    level_done: null,
    amount: null,
    skip_reason: null,
    current_streak: 0,
    levels: [
      { level: 'full', description: 'Run', target: null },
      { level: 'minimum', description: 'Walk', target: null },
    ],
    can_repair: false,
    repair_amount: null,
  };
  const onAddHabit = jest.fn();
  const onEditHabit = jest.fn();

  const openToday = async (rows: TodayRow[]) => {
    api.getToday.mockResolvedValue(rows);
    await render(inApp(<TodayScreen onAddHabit={onAddHabit} onEditHabit={onEditHabit} onOpenReview={jest.fn()} />));
    await settle();
  };

  beforeEach(() => jest.clearAllMocks());

  it('offers Add habit in the empty state', async () => {
    await openToday([]);
    await press('Add habit');
    expect(onAddHabit).toHaveBeenCalled();
  });

  it('offers Add habit under the list, with no limit', async () => {
    await openToday([row]);
    await press('Add habit');
    expect(onAddHabit).toHaveBeenCalled();
  });

  it('edits from the Shrink sheet', async () => {
    await openToday([row]);
    await fireEvent(screen.getByRole('button', { name: /^Run/ }), 'longPress');
    await press('Edit habit');
    expect(onEditHabit).toHaveBeenCalledWith('h1');
    expect(screen.queryByText('Skip today')).toBeNull();
  });
});
