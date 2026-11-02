import { describe, expect, it } from 'vitest';
import {
  filledHabits,
  IDENTITY_SUGGESTIONS,
  onboardingHabitErrors,
  onboardingHabitForm,
  parseReminderTime,
  reminderKey,
  REMINDER_CHOICES,
  STREAK_RULES,
} from './onboarding';
import { toHabitInput } from './habitForm';

describe('onboarding habits', () => {
  it('needs a name and a minimum version', () => {
    expect(onboardingHabitErrors({ title: 'Read', minimum: '' }).minimumDescription).toBeTruthy();
    expect(onboardingHabitErrors({ title: '', minimum: 'One page' }).title).toBeTruthy();
    expect(onboardingHabitErrors({ title: 'Read', minimum: 'One page' })).toEqual({});
  });

  it('ignores a blank slot but not a half-filled one', () => {
    const habits = [
      { title: 'Read', minimum: 'One page' },
      { title: '', minimum: '' },
      { title: 'Run', minimum: '' },
    ];
    expect(filledHabits(habits).map((habit) => habit.title)).toEqual(['Read', 'Run']);
  });

  it('builds a yes or no habit for every day with a full and minimum version', () => {
    const input = toHabitInput(onboardingHabitForm({ title: ' Read ', minimum: 'One page' }, 'i1'));
    expect(input).toMatchObject({ identityId: 'i1', title: 'Read', type: 'boolean' });
    expect(input.scheduleDays).toHaveLength(7);
    expect(input.levels.map((level) => level.level)).toEqual(['full', 'minimum']);
  });

  it('gives every suggestion an example', () => {
    for (const suggestion of IDENTITY_SUGGESTIONS) {
      expect(onboardingHabitErrors({ title: suggestion.example, minimum: suggestion.minimum })).toEqual({});
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
