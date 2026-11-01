import { describe, expect, it } from 'vitest';
import {
  emptyHabitForm,
  FIELD_LIMITS,
  habitFormFromDetail,
  habitLimitMessage,
  hasErrors,
  toggleDay,
  toHabitInput,
  usesTarget,
  validateHabitForm,
} from './habitForm';
import { HabitType } from './api';

const valid = (patch = {}) => ({
  ...emptyHabitForm('i1'),
  title: 'Read',
  minimumDescription: 'One page',
  ...patch,
});

describe('validateHabitForm', () => {
  it('accepts a complete yes/no habit', () => {
    expect(hasErrors(validateHabitForm(valid()))).toBe(false);
  });

  it.each([
    ['identityId', { identityId: null }],
    ['title', { title: '  ' }],
    ['scheduleDays', { scheduleDays: [] }],
    ['minimumDescription', { minimumDescription: '' }],
    ['target', { type: 'count' }],
    ['target', { type: 'duration', target: '0' }],
    ['target', { type: 'count', target: 'lots' }],
    ['minimumTarget', { type: 'count', target: '20', minimumTarget: '20' }],
    ['minimumTarget', { type: 'count', target: '20', minimumTarget: '-1' }],
    ['milestoneLabel', { milestoneAmount: '300' }],
    ['milestoneAmount', { milestoneLabel: 'book' }],
    ['milestoneAmount', { milestoneAmount: 'x', milestoneLabel: 'book' }],
  ])('flags %s for %j', (field, patch) => {
    expect(validateHabitForm(valid(patch))).toHaveProperty(field);
  });
});

describe('validateHabitForm with a new identity', () => {
  it('needs no chosen identity', () => {
    expect(hasErrors(validateHabitForm(valid({ identityId: null }), 'Reader'))).toBe(false);
  });

  it('needs a name', () => {
    expect(validateHabitForm(valid(), '  ').identityId).toBe('Give the identity a name');
  });
});

describe('toHabitInput', () => {
  it('turns typed values into API input', () => {
    const input = toHabitInput(
      valid({
        type: 'count',
        target: '20',
        unit: ' pages ',
        minimumTarget: '2',
        setupDescription: ' Open the book ',
        scheduleDays: [4, 1],
        voiceAliases: 'book, reading, ',
        milestoneAmount: '300',
        milestoneLabel: 'book',
      })
    );
    expect(input).toMatchObject({
      target: 20,
      unit: 'pages',
      scheduleDays: [1, 4],
      voiceAliases: ['book', 'reading'],
      milestoneAmount: 300,
      milestoneLabel: 'book',
    });
    expect(input.levels).toEqual([
      { level: 'full', description: 'Read', target: 20 },
      { level: 'minimum', description: 'One page', target: 2 },
      { level: 'setup', description: 'Open the book', target: null },
    ]);
  });

  it('leaves the setup level out when blank', () => {
    expect(toHabitInput(valid()).levels.map((l) => l.level)).toEqual(['full', 'minimum']);
  });
});

describe('habitFormFromDetail', () => {
  it('round-trips a saved habit through the form', () => {
    const values = habitFormFromDetail({
      id: 'h1',
      identity_id: 'i1',
      title: 'Read',
      type: 'count',
      target: 20,
      unit: 'pages',
      schedule_days: [1, 4],
      voice_aliases: ['book', 'reading'],
      milestone_amount: 300,
      milestone_label: 'book',
      habit_levels: [
        { level: 'minimum', description: 'One page', target: 1 },
        { level: 'full', description: 'Twenty pages', target: 20 },
      ],
    });
    expect(hasErrors(validateHabitForm(values))).toBe(false);
    expect(toHabitInput(values)).toMatchObject({
      title: 'Read',
      target: 20,
      scheduleDays: [1, 4],
      voiceAliases: ['book', 'reading'],
      milestoneAmount: 300,
    });
  });
});

describe('helpers', () => {
  it('knows which types have a target', () => {
    expect(['boolean', 'count', 'duration', 'quit'].filter((t) => usesTarget(t as HabitType))).toEqual([
      'count',
      'duration',
    ]);
  });

  it('matches the database limit on a level description', () => {
    expect(FIELD_LIMITS.levelDescription).toBe(200);
  });

  it('toggles days', () => {
    expect(toggleDay([1, 2], 2)).toEqual([1]);
    expect(toggleDay([1], 3)).toEqual([1, 3]);
  });

  it('explains the habit limit', () => {
    expect(habitLimitMessage(3, 3)).toBe("You're using 3 of 3 habits. 2 consistent weeks unlock 2 more.");
  });
});
