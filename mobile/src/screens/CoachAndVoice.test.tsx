import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatEvent, CoachError, TodayRow, VoiceIntent, VoiceLevel, VoiceParse } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { ai } from '../services/ai';
import { speak } from '../services/speak';
import { tracker } from '../services/tracker';
import { speechInput } from '../voice/speech';
import { EntitlementsProvider } from '../hooks/useEntitlements';
import { TodayScreen } from './TodayScreen';

jest.mock('../services/ai', () => ({ ai: { chat: jest.fn(), parseVoice: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../hooks/useNudges', () => ({ useNudges: jest.fn() }));
jest.mock('../services/widget', () => ({ refreshWidget: jest.fn() }));
jest.mock('../services/live', () => ({ watchMyActivity: () => () => {} }));
jest.mock('../services/speak', () => ({ speak: jest.fn() }));
jest.mock('../voice/speech', () => ({ speechInput: jest.fn(() => null) }));
jest.mock('../services/tracker', () => ({
  tracker: {
    getToday: jest.fn(),
    getRepairs: jest.fn(() => Promise.resolve([])),
    logHabit: jest.fn(() => Promise.resolve()),
    addAmount: jest.fn(() =>
      Promise.resolve({
        counted: true, added: 20, total: 20, unit: 'pages', said_unit: null, minimum: 5,
        target: 30, status: 'done', level: 'minimum', repaired: false,
      })
    ), // prettier-ignore
    skipHabit: jest.fn(() => Promise.resolve()),
    undoLog: jest.fn(() => Promise.resolve()),
    listIdentities: jest.fn(() => Promise.resolve([])),
    listVoiceHabits: jest.fn(() =>
      Promise.resolve([{ id: 'h1', title: 'Read', voice_aliases: ['book'], type: 'count', unit: 'pages' }])
    ),
    getPlan: jest.fn(() => Promise.resolve('pro')),
    saveCheckin: jest.fn(() => Promise.resolve()),
    getCheckinState: jest.fn(() => Promise.reject(new Error('not needed'))),
  },
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const api = tracker as jest.Mocked<typeof tracker>;
const coachApi = ai as jest.Mocked<typeof ai>;
const speech = speechInput as jest.Mock;

const row = (patch: Partial<TodayRow> = {}) =>
  ({
    day: '2026-11-02',
    is_today: true,
    habit_id: 'h1',
    identity_id: 'i1',
    identity_name: 'The Reader',
    colour_token: 'identity-1',
    title: 'Read',
    habit_type: 'boolean',
    target: null,
    unit: null,
    status: 'pending',
    level_done: null,
    amount: null,
    skip_reason: null,
    current_streak: 3,
    levels: [],
    can_repair: false,
    repair_amount: null,
    ...patch,
  }) as TodayRow;

const replies = (...items: (string | Error | ChatEvent)[]) =>
  async function* (): AsyncGenerator<ChatEvent> {
    for (const item of items) {
      if (item instanceof Error) throw item;
      yield typeof item === 'string' ? { type: 'text', text: item } : item;
    }
  };

const settle = () => act(async () => {});
const press = async (name: string) => {
  await fireEvent.press(screen.getByRole('button', { name }));
  await settle();
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
        <EntitlementsProvider>
          <TodayScreen onAddHabit={onAddHabit} onEditHabit={jest.fn()} onOpenReview={onOpenReview} />
        </EntitlementsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await settle();
};

const onAddHabit = jest.fn();
const onOpenReview = jest.fn();
const read = { habit_id: 'h1', habit_title: 'Read' };
const parsed = (text: string, intents: VoiceIntent[], level?: VoiceLevel): VoiceParse => ({
  heard: text,
  corrected: text,
  confidence: 1,
  level: level ?? (intents.length > 0 ? 'high' : 'off_topic'),
  intents,
  missing_habit: null,
});

const said = async (text: string, intents: VoiceIntent[], level?: VoiceLevel) => {
  coachApi.parseVoice.mockResolvedValue(parsed(text, intents, level));
  await press('Log by voice');
  await fireEvent.changeText(screen.getByLabelText('What did you do?'), text);
  await press('Log it');
};

beforeEach(() => {
  jest.clearAllMocks();
  speech.mockReturnValue(null);
  api.getToday.mockResolvedValue([row()]);
  api.getRepairs.mockResolvedValue([]);
  coachApi.chat.mockImplementation(replies('Start ', 'small.'));
});

describe('coach card', () => {
  it('shows on Today and asks the coach when tapped', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: /^Coach suggestion/ }));
    await settle();
    expect(coachApi.chat).toHaveBeenCalledWith(
      [{ role: 'user', text: expect.any(String) }],
      'card',
      undefined
    );
    expect(screen.getByText('Start small.')).toBeTruthy();
  });

  it('never calls the AI just to show a card', async () => {
    await open();
    expect(coachApi.chat).not.toHaveBeenCalled();
  });

  it("doesn't show without habits", async () => {
    api.getToday.mockResolvedValue([]);
    await open();
    expect(screen.queryByRole('button', { name: /^Coach suggestion/ })).toBeNull();
  });
});

describe('miss review', () => {
  const slip = {
    habit_id: 'h2',
    identity_id: 'i1',
    title: 'Run',
    repair_on: '2026-11-03',
    colour_token: 'identity-1',
    current_streak: 0,
  };

  const openReview = async () => {
    api.getRepairs.mockResolvedValue([slip] as never);
    await open();
    await fireEvent.press(screen.getByRole('button', { name: /^Coach suggestion/ }));
    await settle();
  };

  it('asks what got in the way, kindly', async () => {
    await openReview();
    expect(screen.getByText('Run slipped')).toBeTruthy();
    expect(screen.getByText('That happens. What got in the way?')).toBeTruthy();
    expect(coachApi.chat).not.toHaveBeenCalled();
  });

  it('shows why it matters', async () => {
    api.listIdentities.mockResolvedValue([
      { id: 'i1', name: 'The Athlete', colour_token: 'identity-1', why_text: 'For my health' },
    ]);
    await openReview();
    expect(screen.getByText('For my health')).toBeTruthy();
  });

  it('passes the one-tap reason to the coach', async () => {
    jest.useFakeTimers();
    await openReview();
    await press('Too tired');
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    jest.useRealTimers();
    await settle();
    expect(coachApi.chat).toHaveBeenCalledWith(
      [{ role: 'user', text: 'Run slipped. Too tired.' }],
      'miss_review',
      'tired'
    );
  });

  it('can be left alone', async () => {
    await openReview();
    await press('Not now');
    expect(coachApi.chat).not.toHaveBeenCalled();
  });
});

describe('the widget voice button', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens the voice sheet straight away', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('habittracker://voice');
    await open();
    expect(screen.getByLabelText('What did you do?')).toBeTruthy();
  });

  it('ignores other links', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('exp://192.168.1.2:8081');
    await open();
    expect(screen.queryByLabelText('What did you do?')).toBeNull();
  });
});

describe('Sunday card', () => {
  it('opens the review on a Sunday', async () => {
    api.getToday.mockResolvedValue([row({ day: '2026-11-08' })]);
    await open();
    await fireEvent.press(screen.getByRole('button', { name: /^Coach suggestion/ }));
    expect(onOpenReview).toHaveBeenCalled();
  });
});

describe('coach drawer', () => {
  it('builds the reply as it streams', async () => {
    let release = () => {};
    coachApi.chat.mockImplementation(async function* () {
      yield { type: 'text', text: 'Start ' };
      await new Promise<void>((resolve) => (release = resolve));
      yield { type: 'text', text: 'small.' };
    });
    await open();
    await press('Ask coach');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Help');
    await press('Send');
    expect(screen.getByText('Start')).toBeTruthy();
    await act(async () => release());
    expect(screen.getByText('Start small.')).toBeTruthy();
  });

  it('sends the whole conversation each time', async () => {
    await open();
    await press('Ask coach');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'One');
    await press('Send');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Two');
    await press('Send');
    expect(coachApi.chat).toHaveBeenLastCalledWith(
      [
        { role: 'user', text: 'One' },
        { role: 'assistant', text: 'Start small.' },
        { role: 'user', text: 'Two' },
      ],
      'chat',
      undefined
    );
  });

  it('offers the action chips on a new conversation', async () => {
    await open();
    await press('Ask coach');
    await press('I feel burned out');
    expect(coachApi.chat).toHaveBeenCalledWith(
      [{ role: 'user', text: 'I feel burned out' }],
      'burned_out',
      undefined
    );
    expect(screen.queryByRole('button', { name: 'Quick log my day' })).toBeNull();
  });

  it('opens the voice sheet from Quick log my day', async () => {
    jest.useFakeTimers();
    await open();
    await press('Ask coach');
    await press('Quick log my day');
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    jest.useRealTimers();
    expect(screen.getByLabelText('What did you do?')).toBeTruthy();
  });

  it('shows a calm message and keeps logging working when the coach is busy', async () => {
    coachApi.chat.mockImplementation(
      replies(new CoachError('Coach is busy, try again in a minute.', 'busy', 60))
    );
    await open();
    await press('Ask coach');
    await press('I feel burned out');
    expect(screen.getByText('Coach is busy, try again in a minute.')).toBeTruthy();
    await press('Close');
    await fireEvent.press(screen.getByRole('button', { name: /^Read,/ }));
    await settle();
    expect(api.logHabit).toHaveBeenCalled();
  });

  it('shows the test account message as it is', async () => {
    coachApi.chat.mockImplementation(
      replies(new CoachError('Coach is only open to test accounts for now.', 'test_only'))
    );
    await open();
    await press('Ask coach');
    await press('I feel burned out');
    expect(screen.getByText('Coach is only open to test accounts for now.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('never shows a raw failure', async () => {
    coachApi.chat.mockImplementation(replies(new TypeError('stream exploded')));
    await open();
    await press('Ask coach');
    await press('I feel burned out');
    expect(screen.queryByText(/exploded/)).toBeNull();
    expect(screen.getByText(/Your habits still work/)).toBeTruthy();
  });

  it('retries, replacing a reply that was cut off', async () => {
    coachApi.chat.mockImplementationOnce(replies('Half', new CoachError('Busy', 'busy')));
    await open();
    await press('Ask coach');
    await press('I feel burned out');
    await press('Try again');
    expect(coachApi.chat).toHaveBeenLastCalledWith(
      [{ role: 'user', text: 'I feel burned out' }],
      'chat',
      undefined
    );
    expect(screen.getByText('Start small.')).toBeTruthy();
    expect(screen.queryByText('Half')).toBeNull();
  });
});

describe('coach actions', () => {
  const decided = (intents: VoiceIntent[], level: VoiceLevel = 'high', missing: string | null = null) =>
    replies({ type: 'actions', ...parsed('x', intents, level), missing_habit: missing });

  const tell = async (text: string) => {
    await press('Ask coach');
    await fireEvent.changeText(screen.getByLabelText('Message'), text);
    await press('Send');
  };

  it('does it, says what it did, and offers Undo', async () => {
    coachApi.chat.mockImplementation(decided([{ intent: 'log_habit', ...read }]));
    await open();
    api.getToday.mockResolvedValue([row({ current_streak: 4 })]);
    await tell('I read today');
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', null, 'coach');
    expect(screen.getByText('Logged Read. 4-day streak.')).toBeTruthy();
    await press('Undo');
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'coach');
  });

  it('asks first when it had to guess, and acts on Yes', async () => {
    coachApi.chat.mockImplementation(decided([{ intent: 'skip_habit', ...read, reason: '' }], 'medium'));
    await open();
    await tell('skeep it');
    expect(api.skipHabit).not.toHaveBeenCalled();
    expect(screen.getByText('Did you mean: Skip Read?')).toBeTruthy();
    await press('Yes');
    expect(api.skipHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'Not today', 'coach');
  });

  it('does nothing on No', async () => {
    coachApi.chat.mockImplementation(decided([{ intent: 'log_habit', ...read }], 'medium'));
    await open();
    await tell('hmm');
    await press('No');
    expect(api.logHabit).not.toHaveBeenCalled();
  });

  it('asks which when two habits fit', async () => {
    coachApi.chat.mockImplementation(
      decided([
        {
          intent: 'ask_which',
          action: 'log_habit',
          options: [read, { habit_id: 'h2', habit_title: 'Run' }],
        },
      ])
    );
    await open();
    await tell('did it');
    expect(screen.getByText('Read or Run?')).toBeTruthy();
    await press('Run');
    expect(api.logHabit).toHaveBeenCalledWith('h2', null, 'full', null, 'coach');
  });

  it('undoes a named habit', async () => {
    api.getToday.mockResolvedValue([row({ status: 'done', level_done: 'full' })]);
    coachApi.chat.mockImplementation(decided([{ intent: 'undo_habit', ...read }]));
    await open();
    await tell('undo the read');
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'coach');
    expect(screen.getByText('Undid Read.')).toBeTruthy();
  });

  it('shrinks by name', async () => {
    coachApi.chat.mockImplementation(decided([{ intent: 'shrink_habit', ...read }]));
    await open();
    await tell('just the minimum for read');
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'minimum', null, 'coach');
  });

  it('shares undo with voice', async () => {
    await open();
    await said('I read', [{ intent: 'log_habit', ...read }]);
    coachApi.chat.mockImplementation(decided([{ intent: 'undo_last' }]));
    await tell('undo that');
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'coach');
    expect(screen.getByText('Undone.')).toBeTruthy();
  });

  it("offers to create a habit that doesn't exist", async () => {
    coachApi.chat.mockImplementation(decided([], 'no_habit', 'Yoga'));
    await open();
    await tell('I did yoga');
    expect(screen.getByText("You don't have a habit called Yoga.")).toBeTruthy();
    await press('Create it');
    expect(onAddHabit).toHaveBeenCalledWith('Yoga');
  });

  it('shows a refused log calmly', async () => {
    api.logHabit.mockRejectedValueOnce(new Error('That habit is not scheduled on that day'));
    coachApi.chat.mockImplementation(decided([{ intent: 'log_habit', ...read }]));
    await open();
    await tell('I read');
    expect(screen.getByText('That habit is not scheduled on that day')).toBeTruthy();
  });
});

describe('voice', () => {
  it('logs, marks it as voice, confirms out loud and offers undo', async () => {
    await open();
    api.getToday.mockResolvedValue([row({ current_streak: 4 })]);
    await said('I read', [{ intent: 'log_habit', ...read }]);
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', null, 'voice');
    expect(speak).toHaveBeenCalledWith('Logged Read. 4-day streak.');
    expect(screen.getByText('Logged Read. 4-day streak.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('undoes from the banner', async () => {
    await open();
    await said('I read', [{ intent: 'log_habit', ...read }]);
    await press('Undo');
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'voice');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('keeps the undo on offer when it fails', async () => {
    api.undoLog.mockRejectedValueOnce(new Error('offline'));
    await open();
    await said('I read', [{ intent: 'log_habit', ...read }]);
    await press('Undo');
    expect(screen.getByText("That couldn't be undone. Try again.")).toBeTruthy();
    await press('Undo');
    expect(api.undoLog).toHaveBeenCalledTimes(2);
  });

  it('takes the undo away after 10 seconds', async () => {
    await open();
    await said('I read', [{ intent: 'log_habit', ...read }]);
    jest.useFakeTimers();
    await said('I read', [{ intent: 'log_habit', ...read }]);
    await act(async () => {
      jest.advanceTimersByTime(9000);
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    jest.useRealTimers();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('undoes by voice, even after the banner has gone', async () => {
    await open();
    await said('I read', [{ intent: 'log_habit', ...read }]);
    await said('undo that', [{ intent: 'undo_last' }]);
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'voice');
    expect(speak).toHaveBeenLastCalledWith('Undone.');
  });

  it('undoes without the AI, so it works when the AI is down', async () => {
    await open();
    await said('I read', [{ intent: 'log_habit', ...read }]);
    coachApi.parseVoice.mockClear();
    await press('Log by voice');
    await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'Undo that');
    await press('Log it');
    expect(coachApi.parseVoice).not.toHaveBeenCalled();
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'voice');
  });

  it('says so when there is nothing to undo', async () => {
    await open();
    await said('undo that', [{ intent: 'undo_last' }]);
    expect(api.undoLog).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledWith('Nothing to undo.');
  });

  it('undoes everything from one sentence', async () => {
    await open();
    await said('both', [
      { intent: 'log_habit', ...read },
      { intent: 'log_habit', habit_id: 'h2', habit_title: 'Run' },
    ]);
    await press('Undo');
    expect(api.undoLog).toHaveBeenCalledTimes(2);
  });

  it('asks once when two habits match, then logs the answer', async () => {
    await open();
    await said('did it', [
      {
        intent: 'ask_which',
        action: 'log_habit',
        options: [read, { habit_id: 'h2', habit_title: 'Run' }],
      },
    ]);
    expect(api.logHabit).not.toHaveBeenCalled();
    expect(screen.getByText('Read or Run?')).toBeTruthy();
    expect(speak).toHaveBeenCalledWith('Read or Run?');
    await press('Run');
    expect(api.logHabit).toHaveBeenCalledWith('h2', null, 'full', null, 'voice');
  });

  it('offers to create a habit when nothing matches, and never guesses', async () => {
    await open();
    coachApi.parseVoice.mockResolvedValue({
      ...parsed('swimming', [], 'no_habit'),
      missing_habit: 'Swimming',
    });
    await press('Log by voice');
    await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'swimming');
    await press('Log it');
    expect(api.logHabit).not.toHaveBeenCalled();
    await press('Create it');
    expect(onAddHabit).toHaveBeenCalledWith('Swimming');
  });

  it('always shows what it heard', async () => {
    await open();
    await said('I red', [{ intent: 'log_habit', ...read }]);
    expect(screen.getByText('Heard: I red')).toBeTruthy();
  });

  it('shows how it read a correction, at high confidence, without asking', async () => {
    await open();
    coachApi.parseVoice.mockResolvedValue({
      ...parsed('undi the read', [{ intent: 'undo_habit', ...read }]),
      corrected: 'undo the read',
    });
    api.getToday.mockResolvedValue([row({ status: 'done', level_done: 'full' })]);
    await press('Log by voice');
    await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'undi the read');
    await press('Log it');
    expect(screen.getByText('Heard: undi the read → understood as: Undo Read')).toBeTruthy();
  });

  it("undoes only the named habit's log today", async () => {
    api.getToday.mockResolvedValue([row({ status: 'done', level_done: 'full' })]);
    await open();
    await said('undo the read', [{ intent: 'undo_habit', ...read }]);
    expect(api.undoLog).toHaveBeenCalledWith('h1', '2026-11-02', 'voice');
    expect(screen.getByText('Undid Read.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it("offers to create a habit that doesn't exist, without asking to edit", async () => {
    await open();
    coachApi.parseVoice.mockResolvedValue({
      ...parsed('I did yoga', [], 'no_habit'),
      missing_habit: 'Yoga',
    });
    await press('Log by voice');
    await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'I did yoga');
    await press('Log it');
    expect(screen.getByText("You don't have a habit called Yoga.")).toBeTruthy();
    expect(screen.queryByLabelText('What I heard')).toBeNull();
    expect(screen.queryByText(/didn't catch/)).toBeNull();
    await press('Create it');
    expect(onAddHabit).toHaveBeenCalledWith('Yoga');
  });

  it('cancels a missing habit', async () => {
    await open();
    coachApi.parseVoice.mockResolvedValue({
      ...parsed('I did yoga', [], 'no_habit'),
      missing_habit: 'Yoga',
    });
    await press('Log by voice');
    await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'I did yoga');
    await press('Log it');
    await press('Cancel');
    expect(onAddHabit).not.toHaveBeenCalled();
  });

  it('says when something is not about habits, without asking to edit', async () => {
    await open();
    await said('I bought a red car', [], 'off_topic');
    expect(
      screen.getByText("That doesn't sound like a habit update. Try something like 'I read 20 pages'.")
    ).toBeTruthy();
    expect(screen.queryByLabelText('What I heard')).toBeNull();
    expect(api.logHabit).not.toHaveBeenCalled();
  });

  it('asks first at medium confidence, and acts on Yes', async () => {
    await open();
    await said('anduda latest update', [{ intent: 'log_habit', ...read }], 'medium');
    expect(api.logHabit).not.toHaveBeenCalled();
    expect(screen.getByText('Heard: anduda latest update')).toBeTruthy();
    expect(screen.getByText('Did you mean: Log Read?')).toBeTruthy();
    expect(speak).toHaveBeenCalledWith('Did you mean: Log Read?');
    await press('Yes');
    expect(api.logHabit).toHaveBeenCalled();
  });

  it('confirms an undo too', async () => {
    await open();
    await said('I read', [{ intent: 'log_habit', ...read }]);
    await said('anduda latest update', [{ intent: 'undo_last' }], 'medium');
    expect(screen.getByText('Did you mean: Undo the last log?')).toBeTruthy();
    expect(api.undoLog).not.toHaveBeenCalled();
    await press('Yes');
    expect(api.undoLog).toHaveBeenCalled();
  });

  it('goes back to what it heard on No, ready to fix', async () => {
    await open();
    await said('anduda', [{ intent: 'undo_last' }], 'medium');
    await press('No');
    expect(screen.getByLabelText('What I heard').props.value).toBe('anduda');
    expect(api.undoLog).not.toHaveBeenCalled();
  });

  it('shows what it heard at low confidence and lets them fix it', async () => {
    await open();
    await said('blorp frim', [], 'low');
    expect(screen.getByText(/I didn't catch that/)).toBeTruthy();
    const field = screen.getByLabelText('What I heard');
    expect(field.props.value).toBe('blorp frim');
    await fireEvent.changeText(field, 'I read');
    coachApi.parseVoice.mockResolvedValue(parsed('I read', [{ intent: 'log_habit', ...read }]));
    await press('Log it');
    expect(coachApi.parseVoice).toHaveBeenLastCalledWith('I read');
    expect(api.logHabit).toHaveBeenCalled();
  });

  it('never acts at low confidence, even with an intent', async () => {
    await open();
    await said('maybe read', [{ intent: 'log_habit', ...read }], 'low');
    expect(api.logHabit).not.toHaveBeenCalled();
  });

  it('keeps the words when the AI is down, so they can retry', async () => {
    coachApi.parseVoice.mockRejectedValue(new CoachError('Coach is busy', 'busy'));
    await open();
    await press('Log by voice');
    await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'I read');
    await press('Log it');
    expect(screen.getByLabelText('What did you do?').props.value).toBe('I read');
  });

  it('hands a question to the coach', async () => {
    jest.useFakeTimers();
    await open();
    await said('why', [{ intent: 'ask_coach', question: 'Why do I skip?' }]);
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    jest.useRealTimers();
    await settle();
    expect(coachApi.chat).toHaveBeenCalledWith(
      [{ role: 'user', text: 'Why do I skip?' }],
      'chat',
      undefined
    );
  });

  it('stays calm when the AI is down, and tapping still works', async () => {
    coachApi.parseVoice.mockRejectedValue(
      new CoachError("Coach isn't available right now. Your habits still work as normal.", 'unavailable')
    );
    await open();
    await press('Log by voice');
    await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'I read');
    await press('Log it');
    expect(screen.getByText(/Your habits still work/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: /^Read,/ }));
    await settle();
    expect(api.logHabit).toHaveBeenCalledWith('h1', '2026-11-02', 'full', null, 'tap');
  });

  it('points to the keyboard mic when the phone has no speech recognition', async () => {
    await open();
    await press('Log by voice');
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull();
    expect(screen.getByText("Type it, or tap the mic on your phone's keyboard.")).toBeTruthy();
  });

  describe('with speech recognition', () => {
    const recognizer = (granted = true) => {
      const handlers: { text?: (t: string) => void; end?: () => void } = {};
      const input = {
        start: jest.fn(async (_options, text, end) => {
          handlers.text = text;
          handlers.end = end;
          return granted;
        }),
        stop: jest.fn(),
      };
      speech.mockReturnValue(input);
      return { input, handlers };
    };

    it('listens while held and sends what it heard on release', async () => {
      const { input, handlers } = recognizer();
      coachApi.parseVoice.mockResolvedValue(parsed('I read', [{ intent: 'log_habit', ...read }]));
      await open();
      await press('Log by voice');
      const mic = screen.getByRole('button', { name: 'Hold to talk' });
      await fireEvent(mic, 'pressIn');
      await settle();
      expect(screen.getByText('Listening…')).toBeTruthy();
      await act(async () => handlers.text?.('I read'));
      await fireEvent(mic, 'pressOut');
      expect(input.stop).toHaveBeenCalled();
      await act(async () => handlers.end?.());
      await settle();
      expect(coachApi.parseVoice).toHaveBeenCalledWith('I read');
    });

    it('passes the habit names and chosen language to the recogniser', async () => {
      const { input } = recognizer();
      await open();
      await press('Log by voice');
      await press('Hindi');
      await fireEvent(screen.getByRole('button', { name: 'Hold to talk' }), 'pressIn');
      await settle();
      const [options] = input.start.mock.calls[0];
      expect(options.language).toBe('hi-IN');
      expect(options.hints).toEqual(expect.arrayContaining(['undo', 'Read', 'book']));
    });

    it('sends nothing if nothing was heard, and says so', async () => {
      const { handlers } = recognizer();
      await open();
      await press('Log by voice');
      await fireEvent(screen.getByRole('button', { name: 'Hold to talk' }), 'pressIn');
      await settle();
      await act(async () => handlers.end?.());
      expect(coachApi.parseVoice).not.toHaveBeenCalled();
      expect(screen.getByText("I didn't hear anything. Keep holding while you talk.")).toBeTruthy();
    });

    it('explains a refused microphone and leaves the text box', async () => {
      recognizer(false);
      await open();
      await press('Log by voice');
      await fireEvent(screen.getByRole('button', { name: 'Hold to talk' }), 'pressIn');
      await settle();
      expect(screen.getByText('Microphone access is off. You can still type it.')).toBeTruthy();
      expect(screen.getByLabelText('What did you do?')).toBeTruthy();
    });
  });

  describe('on Free', () => {
    beforeEach(() => api.getPlan.mockResolvedValue('free'));
    afterEach(() => api.getPlan.mockResolvedValue('pro'));

    it('shows the coach as available on Pro, calmly, and never opens it', async () => {
      await open();
      expect(screen.getByRole('button', { name: 'Ask coach' }).props.accessibilityState?.disabled).toBe(true);
      expect(screen.getAllByText('Coach · Available on Pro.').length).toBeGreaterThan(0);
    });

    it('logs simple phrases on the phone with no AI, and explains the rest', async () => {
      await open();
      await press('Log by voice');
      await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'read 20 pages');
      await press('Log it');
      await settle();
      expect(api.addAmount).toHaveBeenCalledWith('h1', expect.anything(), 20, null, 'voice');
      expect(coachApi.parseVoice).not.toHaveBeenCalled();
    });

    it('saves a check-in said out loud, on the phone, with no AI', async () => {
      await open();
      await press('Log by voice');
      await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'slept 6 hours, energy low');
      await press('Log it');
      await settle();
      expect(api.saveCheckin).toHaveBeenCalledWith({ sleep: 6, energy: 2 }, 'voice');
      expect(coachApi.parseVoice).not.toHaveBeenCalled();
      expect(screen.getByText('Check-in saved: 6 hours of sleep, energy low.')).toBeTruthy();
    });

    it('lets a habit called Sleep keep "slept 8 hours", but not "energy low"', async () => {
      api.listVoiceHabits.mockResolvedValue([
        { id: 'h2', title: 'Sleep', voice_aliases: ['slept'], type: 'duration', unit: 'hours' },
      ] as never);
      await open();
      await press('Log by voice');
      await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'slept 8 hours');
      await press('Log it');
      await settle();
      expect(api.saveCheckin).not.toHaveBeenCalled();
    });

    it('never sends a free-form phrase to the AI', async () => {
      await open();
      await press('Log by voice');
      await fireEvent.changeText(screen.getByLabelText('What did you do?'), 'I got through some of my novel');
      await press('Log it');
      await settle();
      expect(coachApi.parseVoice).not.toHaveBeenCalled();
      expect(screen.getByText(/simple phrases like "done with Read"/)).toBeTruthy();
    });
  });
});
