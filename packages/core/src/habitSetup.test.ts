import { describe, expect, it } from 'vitest';
import {
  backfillHabit,
  decodeMinimum,
  endsAfterDays,
  fromAiSuggestion,
  parseAmount,
  parseHabitName,
  reviewLines,
  safetyCheck,
  suggestSetup,
} from './habitSetup';

describe('parseHabitName', () => {
  it.each([
    ['Run 20 km', 'Run', 20, 'km'],
    ['read 10 pages daily', 'Read', 10, 'pages'],
    ['drink 2 litres water', 'Drink water', 2, 'litres'],
    ['Drink 2 litres of water every day', 'Drink water', 2, 'litres'],
    ['Meditate 10 min', 'Meditate', 10, 'min'],
    ['walk 10,000 steps', 'Walk', 10000, 'steps'],
    ['10k steps', 'Steps', 10000, 'steps'],
    ['30 push ups a day', 'Push-ups', 30, 'push-ups'],
    ['Swim 20 laps', 'Swim', 20, 'laps'],
    ['roz 2 litre paani peena', 'Roz paani peena', 2, 'litres'],
    ['paanch km daudna', 'Daudna', 5, 'km'],
    ['Study 1.5 hours', 'Study', 1.5, 'hours'],
    ['Meditate', 'Meditate', null, null],
    ['Call mom', 'Call mom', null, null],
  ])('%s', (typed, title, target, unit) => {
    const parsed = parseHabitName(typed);
    expect(parsed.target).toBe(target);
    expect(parsed.unit).toBe(unit);
    if (target !== null) expect(parsed.title).toBe(title);
  });
});

describe('parseAmount', () => {
  it('uses the lower number of a range', () => {
    expect(parseAmount('2-3 pages')).toMatchObject({ amount: 2, unit: 'pages' });
    expect(parseAmount('read 2 to 3 pages')).toMatchObject({ amount: 2, unit: 'pages' });
    expect(parseAmount('2 se 3 panne')).toMatchObject({ amount: 2, unit: 'pages' });
  });

  it('reads number words and amounts with no unit', () => {
    expect(parseAmount('two pages')).toMatchObject({ amount: 2, unit: 'pages' });
    expect(parseAmount('read 8 more')).toMatchObject({ amount: 8, unit: null });
    expect(parseAmount('one thing')).toBeNull();
    expect(parseAmount('nothing here')).toBeNull();
  });
});

describe('decodeMinimum', () => {
  it.each([
    ['read at least 2 pages', 'pages', 2],
    ['atleast 10 min', 'min', 10],
    ['At least 10 minutes', 'min', 10],
    ['Run at least 500 m', 'km', 0.5],
    ['half an hour', 'min', null],
    ['Half hour of reading', 'min', 30],
    ['just put on shoes', null, null],
    ['Read at least 2', 'pages', 2],
  ])('%s', (text, unit, target) => {
    expect(decodeMinimum(text, unit).target).toBe(target);
  });

  it("keeps a minimum in a unit that doesn't fit as a description only", () => {
    expect(decodeMinimum('Read 2 lines', 'pages')).toEqual({ description: 'Read 2 lines', target: null, otherUnit: 'lines' });
  });

  it('keeps the text it was given', () => {
    expect(decodeMinimum('  Put on running shoes and walk 5 minutes ', null).description).toBe(
      'Put on running shoes and walk 5 minutes'
    );
  });
});

describe('suggestSetup', () => {
  it('sets up Run 20 km from the library, keeping their target', () => {
    const { setup, known } = suggestSetup('Run 20 km');
    expect(known).toBe(true);
    expect(setup).toMatchObject({
      title: 'Run',
      type: 'count',
      target: 20,
      unit: 'km',
      frequency: 'per_week',
      perWeek: 3,
      timeOfDay: 'morning',
      identity: 'The Athlete',
      minimumText: 'Run at least 1 km',
      minimumTarget: 1,
      source: 'library',
    });
    expect(setup.reason).toMatch(/rest days/i);
  });

  it('sets up Read with 10 pages and a 2-page minimum, every day', () => {
    expect(suggestSetup('Read').setup).toMatchObject({
      type: 'count',
      target: 10,
      unit: 'pages',
      minimumText: 'Read at least 2 pages',
      minimumTarget: 2,
      frequency: 'days',
      timeOfDay: 'evening',
      identity: 'The Reader',
    });
  });

  it.each([
    ['Workout', 'per_week', 4],
    ['Deep clean', 'per_week', 1],
    ['Read', 'days', null],
  ])('suggests the days for %s', (name, frequency, perWeek) => {
    expect(suggestSetup(name).setup).toMatchObject({ frequency, perWeek });
  });

  it('gives Meditate 10 minutes', () => {
    expect(suggestSetup('Meditate').setup).toMatchObject({ type: 'duration', target: 10, unit: 'min' });
  });

  it('converts their amount to the library unit so the minimum still fits', () => {
    expect(suggestSetup('Run 3000 m').setup).toMatchObject({ target: 3, unit: 'km', minimumTarget: 1 });
  });

  it('falls back to parsing for a name the library does not know', () => {
    const { setup, known } = suggestSetup('Swim 20 laps');
    expect(known).toBe(true);
    const unknown = suggestSetup('Polish telescopes');
    expect(unknown.known).toBe(false);
    expect(unknown.setup).toMatchObject({
      title: 'Polish telescopes',
      type: 'boolean',
      timeOfDay: 'anytime',
      identity: 'Everyday',
      source: 'parsed',
    });
    expect(setup.title).toBe('Swim');
  });

  it('turns an unknown name with an amount into a count habit', () => {
    expect(suggestSetup('Origami 5 items').setup).toMatchObject({
      type: 'count',
      target: 5,
      unit: 'items',
      minimumTarget: 1,
      minimumText: 'At least 1 items',
    });
  });

  it('offers an end for a time-limited goal, without turning it on', () => {
    expect(suggestSetup('30-day challenge').setup.suggestedEndDays).toBe(30);
    expect(suggestSetup('75 day challenge: no sugar').setup.suggestedEndDays).toBe(75);
    expect(suggestSetup('Read').setup.suggestedEndDays).toBeNull();
  });

  it('suggests a reminder from the time of day', () => {
    expect(suggestSetup('Meditate').setup.reminderTime).toBe('08:00');
    expect(suggestSetup('Drink water').setup.reminderTime).toBeNull();
  });
});

describe('safetyCheck', () => {
  it('suggests a gentler start for an extreme distance, and says so calmly', () => {
    const { setup } = suggestSetup('Run 50 km');
    expect(setup.target).toBe(5);
    expect(setup.note).toBe('Starting at 5 km a day is easier on your body. You can raise it any time.');
  });

  it('builds up to long fasts', () => {
    const { setup } = suggestSetup('Fast 36 hours');
    expect(setup.target).toBe(12);
    expect(setup.note).toMatch(/doctor/);
  });

  it('leaves sensible targets alone', () => {
    expect(suggestSetup('Run 10 km').setup.note).toBeNull();
    expect(suggestSetup('Sleep 8 hours').setup.target).toBe(8);
  });

  it('never suggests intense exercise every day', () => {
    const { setup } = suggestSetup('Crossfit');
    expect(setup).toMatchObject({ frequency: 'per_week', perWeek: 4 });
    expect(setup.reason).toBe('Rest days help your body recover.');
  });

  it('keeps the minimum below the target', () => {
    const base = suggestSetup('Read').setup;
    expect(safetyCheck({ ...base, target: 5, minimumTarget: 8 }).minimumTarget).toBe(1);
  });
});

describe('fromAiSuggestion', () => {
  const fallback = suggestSetup('Polish telescopes').setup;

  it('uses what the AI suggested, after checking it', () => {
    const setup = fromAiSuggestion(
      {
        type: 'count',
        target: 2,
        unit: 'Items',
        frequency: 'per_week',
        per_week: 1,
        reason: 'Once a week keeps them clear.',
        time_of_day: 'evening',
        minimum_text: 'Polish one lens',
        minimum_target: 1,
        setup: 'Get the cloth out',
        identity: 'The Stargazer',
        voice_aliases: ['telescope', 42, ''],
      },
      fallback
    );
    expect(setup).toMatchObject({
      type: 'count',
      target: 2,
      unit: 'items',
      frequency: 'per_week',
      perWeek: 1,
      timeOfDay: 'evening',
      identity: 'The Stargazer',
      voiceAliases: ['telescope'],
      reminderTime: '19:00',
      source: 'ai',
    });
  });

  it('keeps the fallback for anything that does not hold up', () => {
    const setup = fromAiSuggestion({ type: 'rocket', per_week: 9, frequency: 'per_week', time_of_day: 'midnight', target: -3 }, fallback);
    expect(setup).toMatchObject({ type: fallback.type, frequency: 'days', perWeek: null, timeOfDay: 'anytime' });
  });

  it('applies the same safety rules', () => {
    const run = suggestSetup('Run').setup;
    expect(fromAiSuggestion({ type: 'count', target: 60, unit: 'km', frequency: 'days' }, run)).toMatchObject({
      target: 5,
      frequency: 'per_week',
      perWeek: 4,
    });
  });
});

describe('endsAfterDays', () => {
  it('counts the start as day 1', () => {
    expect(endsAfterDays('2026-11-07', 30)).toBe('2026-12-06');
    expect(endsAfterDays('2026-11-07', 1)).toBe('2026-11-07');
    expect(endsAfterDays('2026-12-30', 3)).toBe('2027-01-01');
  });
});

describe('reviewLines', () => {
  it('sums up the inferred settings in one line each', () => {
    expect(
      reviewLines({
        type: 'count',
        unit: 'km',
        identity: 'The Athlete',
        reminderTime: '07:30',
        setup: 'Put on running shoes',
        voiceAliases: ['run', 'jog'],
      }).map((l) => `${l.label}: ${l.value}`)
    ).toEqual([
      'Type: Count, in km',
      'Identity: The Athlete',
      'Reminder: 7:30 am',
      'Just set up: Put on running shoes',
      'Voice names: run, jog',
    ]);
  });
});

describe('time of day in the name', () => {
  it('wins over what the library says', () => {
    expect(suggestSetup('Evening run').setup).toMatchObject({ timeOfDay: 'evening', reminderTime: '19:00' });
    expect(suggestSetup('Morning walk').setup.timeOfDay).toBe('morning');
    expect(suggestSetup('Read before bedtime').setup.timeOfDay).toBe('evening');
    expect(suggestSetup('subah ki daud').setup.timeOfDay).toBe('morning');
  });
});

describe('backfillHabit', () => {
  it.each([
    [{ title: 'Read', type: 'count', unit: 'Pages', minimum: '2 pages' }, 'evening', 2],
    [{ title: 'Morning run', type: 'boolean', unit: null, minimum: '1km run' }, 'morning', null],
    [{ title: 'Evening run', type: 'boolean', unit: null, minimum: '1 km run' }, 'evening', null],
    [{ title: 'Meditate', type: 'boolean', unit: null, minimum: 'One slow breath' }, 'morning', null],
    [{ title: 'Exercise', type: 'boolean', unit: null, minimum: 'Go to gym' }, 'morning', null],
    [{ title: 'Writing', type: 'boolean', unit: null, minimum: 'Write 1 atleast 1 line' }, 'morning', null],
    [{ title: 'Polish telescopes', type: 'boolean', unit: null, minimum: 'One lens' }, 'anytime', null],
    [{ title: 'Read', type: 'duration', unit: 'min', minimum: 'atleast 10 min' }, 'evening', 10],
  ] as const)('%o', (habit, timeOfDay, minimumTarget) => {
    expect(backfillHabit(habit)).toMatchObject({ timeOfDay, minimumTarget });
  });
});
