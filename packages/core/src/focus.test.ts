import { describe, expect, it } from 'vitest';
import {
  clockLabel,
  clockSpoken,
  elapsedSeconds,
  FocusAction,
  focusMinutes,
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

  it('counts down by the clock and finishes at zero', () => {
    const started = run(focusStart(1), { type: 'start', now: 0 });
    expect(remainingMs(started, at(20))).toBe(at(40));
    expect(run(started, { type: 'tick', now: at(59) }).phase).toBe('running');
    expect(run(started, { type: 'tick', now: at(60) }).phase).toBe('finished');
  });

  it('finishes on time even if the phone slept through the end', () => {
    const started = run(focusStart(1), { type: 'start', now: 0 });
    expect(run(started, { type: 'tick', now: at(600) }).phase).toBe('finished');
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

  it('counts a stop at the very end as finishing', () => {
    const done = run(focusStart(1), { type: 'start', now: 0 }, { type: 'stop', now: at(60) });
    expect(done.phase).toBe('finished');
  });

  it('ignores actions that make no sense in the current phase', () => {
    const setup = focusStart(25);
    expect(run(setup, { type: 'pause', now: 0 })).toBe(setup);
    expect(run(setup, { type: 'stop', now: 0 })).toBe(setup);
    const finished = run(focusStart(1), { type: 'start', now: 0 }, { type: 'tick', now: at(60) });
    expect(run(finished, { type: 'start', now: at(61) })).toBe(finished);
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
