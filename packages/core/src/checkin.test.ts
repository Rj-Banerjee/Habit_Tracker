import { describe, expect, it } from 'vitest';
import { CheckinState, checkinReply, mentionsEnergyOrMood, parseCheckinPhrase, showCheckin } from './checkin';

const state = (patch: Partial<CheckinState> = {}): CheckinState => ({
  time: 'morning',
  today: '2026-11-08',
  hour: 8,
  checkin: null,
  skipped_today: false,
  ask_to_turn_off: false,
  ...patch,
});

describe('when the check-in card shows', () => {
  it('shows all day on the morning setting until done or skipped', () => {
    expect(showCheckin(state())).toBe(true);
    expect(showCheckin(state({ hour: 15 }))).toBe(true);
    expect(showCheckin(state({ skipped_today: true }))).toBe(false);
    expect(
      showCheckin(state({ checkin: { date: '2026-11-08', energy: 3, sleep_hours: 7, mood: 4, source: 'tap' } }))
    ).toBe(false);
  });

  it('stays until energy and mood are both in, so a voice "slept 6 hours" leaves it open', () => {
    expect(
      showCheckin(state({ checkin: { date: '2026-11-08', energy: null, sleep_hours: 6, mood: null, source: 'voice' } }))
    ).toBe(true);
  });

  it('waits for the evening on the evening setting, and never shows when off', () => {
    expect(showCheckin(state({ time: 'evening', hour: 16 }))).toBe(false);
    expect(showCheckin(state({ time: 'evening', hour: 17 }))).toBe(true);
    expect(showCheckin(state({ time: 'off' }))).toBe(false);
    expect(showCheckin(null)).toBe(false);
  });
});

describe('a check-in by voice', () => {
  it.each([
    ['slept 6 hours, energy low', { sleep: 6, energy: 2 }],
    ['Slept six hours and energy is low', { sleep: 6, energy: 2 }],
    ['7.5 hours of sleep', { sleep: 7.5 }],
    ['I slept 7 hrs', { sleep: 7 }],
    ['energy 4', { energy: 4 }],
    ['energy 3 out of 5, mood good', { energy: 3, mood: 4 }],
    ['low energy', { energy: 2 }],
    ['mood great', { mood: 5 }],
    ['mood is okay', { mood: 3 }],
    ['feeling tired', { energy: 2 }],
    ['feeling exhausted', { energy: 1 }],
    ['6 ghante soya, energy kam', { sleep: 6, energy: 2 }],
    ['mood theek hai', { mood: 3 }],
  ])('"%s"', (text, expected) => {
    expect(parseCheckinPhrase(text)).toEqual(expected);
  });

  it('ignores phrases that are not a check-in', () => {
    expect(parseCheckinPhrase('done with read')).toBeNull();
    expect(parseCheckinPhrase('read 20 pages')).toBeNull();
    expect(parseCheckinPhrase('energy 9')).toBeNull();
  });

  it('only treats energy and mood as always a check-in', () => {
    expect(mentionsEnergyOrMood('energy low')).toBe(true);
    expect(mentionsEnergyOrMood('slept 6 hours')).toBe(false);
  });

  it('says back what it saved', () => {
    expect(checkinReply({ sleep: 6, energy: 2 })).toBe('Check-in saved: 6 hours of sleep, energy low.');
    expect(checkinReply({ mood: 5 })).toBe('Check-in saved: mood great.');
  });
});
