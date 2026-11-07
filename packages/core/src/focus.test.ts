import { describe, expect, it } from 'vitest';
import {
  clockLabel,
  focusFromSaved,
  isDonePhrase,
  minutesLabel,
  clockSpoken,
  elapsedSeconds,
  FocusAction,
  focusAddsTime,
  focusedAmount,
  focusMinutes,
  stopQuestionFor,
  focusReducer,
  focusStart,
  FocusState,
  remainingMs,
} from './focus';

const run = (state: FocusState, ...actions: FocusAction[]) => actions.reduce(focusReducer, state);

describe('focusMinutes', () => {
  it("uses a duration habit's own target", () => {
    expect(focusMinutes({ habit_type: 'duration', target: 20, unit: 'minutes' })).toBe(20);
    expect(focusMinutes({ habit_type: 'duration', target: 2, unit: 'hours' })).toBe(120);
    expect(focusMinutes({ habit_type: 'duration', target: 45, unit: 'min' })).toBe(45);
    expect(focusMinutes({ habit_type: 'duration', target: 30, unit: null })).toBe(30);
  });

  it('uses 25 minutes otherwise', () => {
    expect(focusMinutes({ habit_type: 'count', target: 30, unit: 'pages' })).toBe(25);
    expect(focusMinutes({ habit_type: 'boolean', target: null, unit: null })).toBe(25);
    expect(focusMinutes({ habit_type: 'duration', target: null, unit: 'minutes' })).toBe(25);
  });

  it('keeps it between 1 minute and 4 hours', () => {
    expect(focusMinutes({ habit_type: 'duration', target: 10, unit: 'hours' })).toBe(240);
    expect(focusMinutes({ habit_type: 'duration', target: 20, unit: 'seconds' })).toBe(1);
  });
});

describe('focusReducer', () => {
  const at = (s: number) => s * 1000;

  it('can be changed before starting, and not after', () => {
    const set = run(focusStart(25), { type: 'setMinutes', minutes: 10 });
    expect(set.minutes).toBe(10);
    const started = run(set, { type: 'start', now: 0 }, { type: 'setMinutes', minutes: 50 });
    expect(started.minutes).toBe(10);
  });

  it('counts down by the clock, then asks instead of logging', () => {
    const started = run(focusStart(1), { type: 'start', now: 0 });
    expect(remainingMs(started, at(20))).toBe(at(40));
    expect(run(started, { type: 'tick', now: at(59) }).phase).toBe('running');
    expect(run(started, { type: 'tick', now: at(60) }).phase).toBe('timeUp');
  });

  it('runs out on time even if the phone slept through the end', () => {
    const started = run(focusStart(1), { type: 'start', now: 0 });
    expect(run(started, { type: 'tick', now: at(600) }).phase).toBe('timeUp');
  });

  it('finishes only when told the work is done', () => {
    const up = run(focusStart(1), { type: 'start', now: 0 }, { type: 'tick', now: at(60) });
    const done = run(up, { type: 'workDone', now: at(70) });
    expect(done.phase).toBe('finished');
    expect(elapsedSeconds(done, at(70))).toBe(60);
  });

  it('offers to focus again when it is not done, for the same length', () => {
    const up = run(focusStart(10), { type: 'start', now: 0 }, { type: 'tick', now: at(600) });
    const again = run(up, { type: 'notDone' });
    expect(again.phase).toBe('again');
    const next = run(again, { type: 'focusAgain', now: at(700) });
    expect(next.phase).toBe('running');
    expect(remainingMs(next, at(700))).toBe(at(600));
  });

  it('finishes early when the work is done before the time', () => {
    const done = run(focusStart(25), { type: 'start', now: 0 }, { type: 'workDone', now: at(300) });
    expect(done.phase).toBe('finished');
    expect(elapsedSeconds(done, at(300))).toBe(300);
  });

  it('pauses without losing time', () => {
    const paused = run(focusStart(1), { type: 'start', now: 0 }, { type: 'pause', now: at(10) });
    expect(remainingMs(paused, at(1000))).toBe(at(50));
    const resumed = run(paused, { type: 'resume', now: at(1000) });
    expect(remainingMs(resumed, at(1020))).toBe(at(30));
  });

  it('asks about the minimum version when stopped early, and can carry on', () => {
    const asking = run(focusStart(25), { type: 'start', now: 0 }, { type: 'stop', now: at(600) });
    expect(asking.phase).toBe('asking');
    expect(elapsedSeconds(asking, at(9999))).toBe(600);
    const again = run(asking, { type: 'keepGoing', now: at(700) });
    expect(again.phase).toBe('running');
    expect(remainingMs(again, at(700))).toBe(at(900));
  });

  it('stops from a pause too', () => {
    const asking = run(focusStart(25), { type: 'start', now: 0 }, { type: 'pause', now: at(5) }, { type: 'stop', now: at(500) });
    expect(asking.phase).toBe('asking');
    expect(elapsedSeconds(asking, at(500))).toBe(5);
  });

  it('counts a stop at the very end as the time running out', () => {
    const up = run(focusStart(1), { type: 'start', now: 0 }, { type: 'stop', now: at(60) });
    expect(up.phase).toBe('timeUp');
  });

  it('ignores actions that make no sense in the current phase', () => {
    const setup = focusStart(25);
    expect(run(setup, { type: 'pause', now: 0 })).toBe(setup);
    expect(run(setup, { type: 'stop', now: 0 })).toBe(setup);
    const finished = run(focusStart(1), { type: 'start', now: 0 }, { type: 'workDone', now: at(60) });
    expect(run(finished, { type: 'start', now: at(61) })).toBe(finished);
    expect(run(finished, { type: 'notDone' })).toBe(finished);
    expect(run(setup, { type: 'focusAgain', now: 0 })).toBe(setup);
  });
});

describe('clock', () => {
  it('shows minutes and seconds, rounding up', () => {
    expect(clockLabel(25 * 60_000)).toBe('25:00');
    expect(clockLabel(59_001)).toBe('01:00');
    expect(clockLabel(1)).toBe('00:01');
    expect(clockLabel(0)).toBe('00:00');
  });

  it('adds hours when needed', () => {
    expect(clockLabel(2 * 3600_000)).toBe('2:00:00');
  });

  it('reads well aloud', () => {
    expect(clockSpoken(24 * 60_000 + 1)).toBe('25 minutes left');
    expect(clockSpoken(30_000)).toBe('1 minute left');
  });
});

describe('isDonePhrase', () => {
  it.each([
    'done my work',
    'Done with my work!',
    "I've finished the task",
    'work is done',
    "I'm done",
    'finished',
    'completed it',
    'kaam ho gaya',
    'ho gaya',
    'padhai khatam',
  ])('hears "%s" as done', (said) => {
    expect(isDonePhrase(said)).toBe(true);
  });

  it.each(['not done yet', "it isn't finished", 'abhi nahi hua', 'how long is left', 'pause', ''])(
    'does not hear "%s" as done',
    (said) => {
      expect(isDonePhrase(said)).toBe(false);
    }
  );
});

describe('focusFromSaved', () => {
  const saved = { minutes: 25, endAt: 60_000, paused: false, remainingMs: 0, timeUp: false };

  it('carries on a running session after the app was closed', () => {
    const state = focusFromSaved(saved, 20_000);
    expect(state.phase).toBe('running');
    expect(remainingMs(state, 20_000)).toBe(40_000);
  });

  it('asks the question if the time ran out while it was closed', () => {
    expect(focusFromSaved(saved, 90_000).phase).toBe('timeUp');
    expect(focusFromSaved({ ...saved, timeUp: true }, 0).phase).toBe('timeUp');
  });

  it('keeps a pause', () => {
    const state = focusFromSaved({ ...saved, paused: true, remainingMs: 30_000 }, 999_999);
    expect(state.phase).toBe('paused');
    expect(remainingMs(state, 999_999)).toBe(30_000);
  });
});

describe('minutesLabel', () => {
  it('says minute for one', () => {
    expect(minutesLabel(1)).toBe('1 minute');
    expect(minutesLabel(25)).toBe('25 minutes');
  });
});

describe('focus with amounts', () => {
  const study = { habit_type: 'duration' as const, target: 60, unit: 'min' };

  it('starts at what is left today', () => {
    expect(focusMinutes({ ...study, amount: 35 })).toBe(25);
    expect(focusMinutes({ ...study, amount: 0 })).toBe(60);
    expect(focusMinutes({ ...study, amount: 60 })).toBe(60);
    expect(focusMinutes({ ...study, target: 1.5, unit: 'hours', amount: 1 })).toBe(30);
  });

  it('adds focused minutes in the habit\'s own unit', () => {
    expect(focusAddsTime(study)).toBe(true);
    expect(focusedAmount(study, 25 * 60)).toBe(25);
    expect(focusedAmount({ ...study, unit: 'hours' }, 30 * 60)).toBe(0.5);
    expect(focusedAmount(study, 10)).toBe(1);
  });

  it('logs any other habit as before', () => {
    expect(focusAddsTime({ habit_type: 'count', target: 10, unit: 'pages' })).toBe(false);
    expect(focusAddsTime({ habit_type: 'boolean', target: null, unit: null })).toBe(false);
    expect(focusMinutes({ habit_type: 'count', target: 10, unit: 'pages' })).toBe(25);
  });

  it('asks to add the minutes done, or about the minimum', () => {
    expect(stopQuestionFor(study, 12 * 60)).toBe('Add the 12 minutes you focused?');
    expect(stopQuestionFor(study, 40)).toBe('Add the 1 minute you focused?');
    expect(stopQuestionFor({ habit_type: 'boolean', target: null, unit: null }, 600)).toBe('Log the minimum version?');
  });
});
