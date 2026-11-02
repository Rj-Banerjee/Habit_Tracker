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
  habitLimitMessage,
  HabitType,
  Identity,
  space,
  TodayRow,
} from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';
import { HabitFormScreen } from './HabitFormScreen';
import { TodayScreen } from './TodayScreen';

jest.mock('../services/ai', () => ({ ai: { chat: jest.fn(), parseVoice: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../hooks/useNudges', () => ({ useNudges: jest.fn() }));
jest.mock('../services/widget', () => ({ refreshWidget: jest.fn() }));
jest.mock('../services/speak', () => ({ speak: jest.fn() }));
jest.mock('../voice/speech', () => ({ speechInput: () => null }));

jest.mock('../services/tracker', () => ({
  tracker: {
    listVoiceHabits: jest.fn(() => Promise.resolve([])),
    getHabitAllowance: jest.fn(),
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

const fillRequired = async () => {
  await type('Name', 'Run');
  await type('Minimum version', 'Run 1 km');
};

describe('HabitFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getHabitAllowance.mockResolvedValue({ allowed: 3, active: 1, can_add: true });
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

    it('asks for the allowance on create but not on edit', async () => {
      await openForm('h1');
      expect(api.getHabitAllowance).not.toHaveBeenCalled();
      expect(api.getHabit).toHaveBeenCalledWith('h1');
    });
  });

  describe('load failed', () => {
    it.each([
      ['identities', () => api.listIdentities.mockRejectedValueOnce(new Error('offline'))],
      ['the allowance', () => api.getHabitAllowance.mockRejectedValueOnce(new Error('offline'))],
    ])('offers a retry when %s fail, never an empty form', async (_name, fail) => {
      fail();
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

  describe('the habit cap', () => {
    it('explains the limit in place of the form, with a way back', async () => {
      api.getHabitAllowance.mockResolvedValue({ allowed: 3, active: 3, can_add: false });
      await openForm();
      expect(screen.getByText(habitLimitMessage(3, 3))).toBeTruthy();
      expect(screen.queryByLabelText('Name')).toBeNull();
      await press('Back');
      expect(onClose).toHaveBeenCalled();
    });

    it("doesn't apply to editing a habit", async () => {
      api.getHabitAllowance.mockResolvedValue({ allowed: 3, active: 3, can_add: false });
      await openForm('h1');
      expect(screen.getByLabelText('Name')).toBeTruthy();
    });

    it('shows the server message and keeps the form when another device took the slot', async () => {
      const message = 'You have reached your habit limit. 2 consistent weeks unlock 2 more.';
      api.createHabit.mockRejectedValueOnce(new Error(message));
      await openForm();
      await fillRequired();
      await press('Save');
      await settle();
      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.getByLabelText('Name').props.value).toBe('Run');
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('empty create', () => {
    it('opens blank, titled New habit, with its only identity chosen', async () => {
      await openForm();
      expect(screen.getByRole('header', { name: 'New habit' })).toBeTruthy();
      expect(screen.getByLabelText('Name').props.value).toBe('');
      expect(screen.getByRole('button', { name: 'The Athlete', selected: true })).toBeTruthy();
    });

    it('leaves the choice open with several identities', async () => {
      api.listIdentities.mockResolvedValue([athlete, reader]);
      await openForm();
      expect(screen.getByRole('button', { name: 'The Athlete', selected: false })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'The Reader', selected: false })).toBeTruthy();
    });

    it('keeps More options collapsed until asked', async () => {
      await openForm();
      expect(screen.queryByLabelText('Voice names')).toBeNull();
      expect(screen.queryByLabelText('Milestone amount')).toBeNull();
      await press('More options');
      expect(screen.getByLabelText('Voice names')).toBeTruthy();
      expect(screen.getByLabelText('Milestone amount')).toBeTruthy();
    });

    it('has no edit note or archive option', async () => {
      await openForm();
      expect(screen.queryByText(/Changes apply from today/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Archive habit' })).toBeNull();
    });
  });

  describe('creating', () => {
    it.each<[HabitType, string]>([
      ['boolean', 'Yes or no'],
      ['quit', 'Quit'],
    ])('saves a %s habit without a target', async (habitType, label) => {
      await openForm();
      await press(label);
      expect(screen.queryByLabelText('Target')).toBeNull();
      await fillRequired();
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          identityId: 'i1',
          title: 'Run',
          type: habitType,
          target: null,
          unit: null,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });

    it.each<[HabitType, string]>([
      ['count', 'Count'],
      ['duration', 'Duration'],
    ])('saves a %s habit with its target and unit', async (habitType, label) => {
      await openForm();
      await press(label);
      await fillRequired();
      await type('Target', '30');
      await type('Unit', 'pages');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0]).toEqual(
        expect.objectContaining({ type: habitType, target: 30, unit: 'pages' })
      );
    });

    it('drops a target typed before switching to a type without one', async () => {
      await openForm();
      await press('Count');
      await type('Target', '30');
      await type('Minimum target', '50');
      await press('Yes or no');
      await fillRequired();
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0]).toEqual(
        expect.objectContaining({ type: 'boolean', target: null })
      );
      const { levels } = api.createHabit.mock.calls[0][0];
      expect(levels.every((level) => level.target === null)).toBe(true);
    });

    it('sets all three Shrink levels', async () => {
      await openForm();
      await press('Count');
      await type('Name', 'Read');
      await type('Target', '30');
      await type('Full version', 'Read 30 pages');
      await type('Minimum version', 'Read one page');
      await type('Minimum target', '1');
      await type('Just set up', 'Open the book');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0].levels).toEqual([
        { level: 'full', description: 'Read 30 pages', target: 30 },
        { level: 'minimum', description: 'Read one page', target: 1 },
        { level: 'setup', description: 'Open the book', target: null },
      ]);
    });

    it('defaults the full version to the name and leaves setup out when blank', async () => {
      await openForm();
      await fillRequired();
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0].levels).toEqual([
        { level: 'full', description: 'Run', target: null },
        { level: 'minimum', description: 'Run 1 km', target: null },
      ]);
    });

    it('sends the chosen days', async () => {
      await openForm();
      await fillRequired();
      await press('Sat');
      await press('Sun');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0].scheduleDays).toEqual([1, 2, 3, 4, 5]);
    });

    it('saves voice names and a milestone', async () => {
      await openForm();
      await fillRequired();
      await press('More options');
      await type('Voice names', 'jog, morning run');
      await type('Milestone amount', '300');
      await type('Milestone label', 'book');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          voiceAliases: ['jog', 'morning run'],
          milestoneAmount: 300,
          milestoneLabel: 'book',
        })
      );
    });
  });

  describe('identities', () => {
    it('shows the add-identity fields in place of choices when there are none', async () => {
      api.listIdentities.mockResolvedValue([]);
      await openForm();
      expect(screen.getByLabelText('Identity name')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'New identity' })).toBeNull();
    });

    it('saves the new identity and the habit in one call', async () => {
      api.listIdentities.mockResolvedValue([]);
      await openForm();
      await type('Identity name', ' The Reader ');
      await type('Why this matters', 'Calm evenings');
      await fillRequired();
      await press('Save');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
      expect(api.createHabit.mock.calls[0][1]).toEqual({
        name: 'The Reader',
        colourToken: 'identity-1',
        whyText: 'Calm evenings',
      });
    });

    it('defaults the colour to the first one not in use', async () => {
      api.listIdentities.mockResolvedValue([athlete, reader]);
      await openForm();
      await press('New identity');
      await type('Identity name', 'The Maker');
      await fillRequired();
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][1]).toMatchObject({ colourToken: 'identity-3' });
    });

    it('uses the colour picked', async () => {
      await openForm();
      await press('New identity');
      await type('Identity name', 'The Maker');
      await press('Plum');
      await fillRequired();
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[0][1]).toMatchObject({ colourToken: 'identity-5' });
    });

    it('requires a name for a new identity and sends nothing', async () => {
      await openForm();
      await press('New identity');
      await fillRequired();
      await press('Save');
      await settle();
      expect(screen.getByText('Give the identity a name')).toBeTruthy();
      expect(api.createHabit).not.toHaveBeenCalled();
    });

    it('limits an identity name to 80 characters', async () => {
      await openForm();
      await press('New identity');
      expect(screen.getByLabelText('Identity name').props.maxLength).toBe(80);
    });

    it('keeps everything typed when the save fails, and sends the identity again on retry', async () => {
      api.createHabit.mockRejectedValueOnce(new Error('Network request failed'));
      await openForm();
      await press('New identity');
      await type('Identity name', 'The Maker');
      await fillRequired();
      await press('Save');
      await settle();
      expect(screen.getByText('Network request failed')).toBeTruthy();
      expect(screen.getByLabelText('Identity name').props.value).toBe('The Maker');
      await press('Save');
      await settle();
      expect(api.createHabit.mock.calls[1][1]).toMatchObject({ name: 'The Maker' });
    });
  });

  describe('editing', () => {
    beforeEach(() => {
      api.listIdentities.mockResolvedValue([athlete, reader]);
    });

    it('opens filled in, titled Edit habit, with the type hidden', async () => {
      await openForm('h1');
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
      expect(screen.getByRole('button', { name: 'The Reader', selected: true })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'The Athlete', selected: false })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'New identity' })).toBeTruthy();
    });

    it('moves the habit to another identity', async () => {
      await openForm('h1');
      await press('The Athlete');
      await press('Save');
      await settle();
      expect(api.updateHabit).toHaveBeenCalledWith('h1', { identityId: 'i1' });
    });

    it('moves the habit to a new identity', async () => {
      await openForm('h1');
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
      await press('New identity');
      await press('Save');
      await settle();
      expect(screen.getByText('Give the identity a name')).toBeTruthy();
      expect(api.updateHabit).not.toHaveBeenCalled();
    });

    it('counts a move as an unsaved change', async () => {
      await openForm('h1');
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
      await press('More options');
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
      await press('More options');
      await type('Unit', '');
      await type('Milestone amount', '');
      await type('Milestone label', '');
      expect(screen.getByText('For example, 300 pages = 1 book.')).toBeTruthy();
      expect(screen.queryByText(/can't be removed/)).toBeNull();
    });

    it('still asks for both halves of a milestone', async () => {
      await openForm('h1');
      await press('More options');
      await type('Milestone label', '');
      await press('Save');
      await settle();
      expect(api.updateHabit).not.toHaveBeenCalled();
    });
  });

  describe('field errors', () => {
    it('shows each problem and sends nothing', async () => {
      api.listIdentities.mockResolvedValue([athlete, reader]);
      await openForm();
      await press('Count');
      for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await press(day);
      await press('Save');
      await settle();
      expect(screen.getByText('Choose an identity')).toBeTruthy();
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

    it('opens More options when the problem is inside it', async () => {
      await openForm();
      await fillRequired();
      await press('More options');
      await type('Milestone amount', '300');
      await press('Fewer options');
      await press('Save');
      await settle();
      expect(screen.getByText('Name the milestone, such as "book"')).toBeTruthy();
      expect(api.createHabit).not.toHaveBeenCalled();
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
      await press('Count');
      await fillRequired();
      await type('Target', '30');
      await type('Just set up', 'Lay out shoes');
      await press('Save');
      await settle();
      expect(screen.getByText('Network request failed')).toBeTruthy();
      expect(screen.getByLabelText('Target').props.value).toBe('30');
      expect(screen.getByLabelText('Just set up').props.value).toBe('Lay out shoes');
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

    it('counts a new identity as typing', async () => {
      await openForm();
      await press('New identity');
      await type('Identity name', 'The Maker');
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
      await fireEvent(screen.getByLabelText('Just set up'), 'submitEditing');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });

    it('moves Enter to the last field once More options is open', async () => {
      widen();
      await openForm();
      await fillRequired();
      await press('More options');
      expect(screen.getByLabelText('Just set up').props.onSubmitEditing).toBeUndefined();
      await fireEvent(screen.getByLabelText('Milestone label'), 'submitEditing');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });

    it('ignores Enter while a save is running', async () => {
      widen();
      api.createHabit.mockReturnValue(new Promise(() => {}));
      await openForm();
      await fillRequired();
      await fireEvent(screen.getByLabelText('Just set up'), 'submitEditing');
      await fireEvent(screen.getByLabelText('Just set up'), 'submitEditing');
      await settle();
      expect(api.createHabit).toHaveBeenCalledTimes(1);
    });

    it("leaves Enter alone on a phone, where Done only closes the keyboard", async () => {
      await openForm();
      expect(screen.getByLabelText('Just set up').props.onSubmitEditing).toBeUndefined();
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
      await press('More options');
      const buttons = screen.getAllByRole('button');
      expect(screen.getAllByRole('button', { name: /\S/ })).toHaveLength(buttons.length);
    });

    it('holds text fields to what the database accepts', async () => {
      await openForm();
      await press('Count');
      await press('More options');
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

  it('offers Add habit under a full list, so the limit can explain itself', async () => {
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
