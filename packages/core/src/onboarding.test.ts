import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_HABITS,
  filledHabits,
  onboardingHabitErrors,
  onboardingHabitSetup,
  suggestedMinimum,
  parseReminderTime,
  reminderKey,
  REMINDER_CHOICES,
  STREAK_RULES,
} from './onboarding';
import { toHabitInput } from './habitForm';

describe('onboarding habits', () => {
  it('needs only a name: the minimum is suggested when left blank', () => {
    expect(onboardingHabitErrors({ title: '', minimum: 'One page' }).title).toBeTruthy();
    expect(onboardingHabitErrors({ title: 'Read', minimum: '' })).toEqual({});
    expect(onboardingHabitErrors({ title: 'Polish telescopes', minimum: '' })).toEqual({});
  });

  it('ignores a blank slot but not a half-filled one', () => {
    const habits = [
      { title: 'Read', minimum: 'One page' },
      { title: '', minimum: '' },
      { title: 'Run', minimum: '' },
    ];
    expect(filledHabits(habits).map((habit) => habit.title)).toEqual(['Read', 'Run']);
  });

  it('sets up a habit the way the form does, with its identity', () => {
    const { values, identity } = onboardingHabitSetup({ title: ' Read ', minimum: '' });
    const input = toHabitInput(values, '2026-11-07');
    expect(identity).toBe('The Reader');
    expect(input).toMatchObject({ title: 'Read', type: 'count', target: 10, unit: 'pages', timeOfDay: 'evening' });
    expect(input.levels[1]).toEqual({ level: 'minimum', description: 'Read at least 2 pages', target: 2 });
  });

  it('keeps the minimum they wrote, and an amount in the name', () => {
    const { values } = onboardingHabitSetup({ title: 'Run 5 km', minimum: 'Run at least 500 m' });
    const input = toHabitInput(values, '2026-11-07');
    expect(input).toMatchObject({ title: 'Run', target: 5, unit: 'km', frequency: 'per_week', perWeek: 3 });
    expect(input.levels[1]).toMatchObject({ description: 'Run at least 500 m', target: 0.5 });
  });

  it('suggests a minimum for every example', () => {
    for (const example of EXAMPLE_HABITS) {
      expect(suggestedMinimum(example)).not.toBe('');
      expect(onboardingHabitErrors({ title: example, minimum: '' })).toEqual({});
    }
  });
});

describe('reminder times', () => {
  it.each([
    ['7:30', { hour: 7, minute: 30 }],
    ['07:30', { hour: 7, minute: 30 }],
    ['19:05', { hour: 19, minute: 5 }],
    ['0:00', { hour: 0, minute: 0 }],
    [' 23:59 ', { hour: 23, minute: 59 }],
  ])('reads %s', (text, time) => {
    expect(parseReminderTime(text)).toEqual(time);
  });

  it.each(['24:00', '7:60', 'morning', '7', '', '7:5'])('refuses %s', (text) => {
    expect(parseReminderTime(text)).toBeNull();
  });

  it('round-trips the choices', () => {
    for (const choice of REMINDER_CHOICES) {
      expect(reminderKey(parseReminderTime(choice)!)).toBe(choice);
    }
  });
});

describe('the streak rules', () => {
  it('stays calm', () => {
    expect(JSON.stringify(STREAK_RULES)).not.toMatch(/fail|lose|lost|broken|penalty|punish/i);
  });
});
