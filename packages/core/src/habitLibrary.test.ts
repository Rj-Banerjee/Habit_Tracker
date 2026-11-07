import { describe, expect, it } from 'vitest';
import { coreWords, HABIT_LIBRARY, matchLibrary, normalise, suggestNames } from './habitLibrary';
import { DAILY_CAPS, FAST_HOURS_CAP, findUnit, isFast, isRestDuration, SLEEP_HOURS_CAP } from './units';

const named = (name: string) => matchLibrary(name)?.id ?? null;

describe('the habit library', () => {
  it('has about 150 common habits, each with its own id', () => {
    expect(HABIT_LIBRARY.length).toBeGreaterThanOrEqual(150);
    expect(new Set(HABIT_LIBRARY.map((h) => h.id)).size).toBe(HABIT_LIBRARY.length);
  });

  it.each(HABIT_LIBRARY.map((h) => [h.id, h] as const))('%s is a habit the server would accept', (_id, habit) => {
    expect(habit.name.trim()).not.toBe('');
    expect(habit.name.length).toBeLessThanOrEqual(100);
    expect(habit.minimum.description.trim()).not.toBe('');
    expect(habit.minimum.description.length).toBeLessThanOrEqual(200);
    expect(habit.setup.trim()).not.toBe('');
    expect(habit.reason.trim()).not.toBe('');
    expect(habit.identity).toMatch(/^The /);
    expect(['morning', 'afternoon', 'evening', 'anytime']).toContain(habit.timeOfDay);
    if (habit.type === 'count' || habit.type === 'duration') {
      expect(habit.target).toBeGreaterThan(0);
      expect(findUnit(habit.unit)).not.toBeNull();
    } else {
      expect(habit.target).toBeNull();
      expect(habit.unit).toBeNull();
      expect(habit.minimum.target).toBeNull();
    }
    if (habit.minimum.target !== null) expect(habit.minimum.target).toBeLessThan(habit.target ?? 0);
    if (habit.frequency === 'per_week') {
      expect(habit.perWeek).toBeGreaterThanOrEqual(1);
      expect(habit.perWeek).toBeLessThanOrEqual(6);
    } else {
      expect(habit.perWeek).toBeNull();
    }
  });

  it('never suggests an extreme target', () => {
    const over = HABIT_LIBRARY.filter((h) => {
      if (!h.unit || h.target === null) return false;
      if (isRestDuration(h.name)) return h.target > (isFast(h.name) ? FAST_HOURS_CAP : SLEEP_HOURS_CAP);
      return h.target > (DAILY_CAPS[h.unit] ?? Infinity);
    });
    expect(over.map((h) => h.id)).toEqual([]);
  });

  it('gives intense exercise rest days', () => {
    for (const id of ['run', 'workout', 'strength', 'hiit', 'cycle', 'swim', 'pullups', 'marathon']) {
      const habit = HABIT_LIBRARY.find((h) => h.id === id)!;
      expect({ id, frequency: habit.frequency }).toEqual({ id, frequency: 'per_week' });
      expect(habit.perWeek).toBeLessThanOrEqual(4);
    }
  });

  it("doesn't use one name for two habits", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const habit of HABIT_LIBRARY) {
      for (const name of [habit.name, ...habit.synonyms]) {
        const key = coreWords(name).join(' ');
        const owner = seen.get(key);
        if (owner && owner !== habit.id) clashes.push(`${name}: ${owner} and ${habit.id}`);
        seen.set(key, habit.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('offers an end only for time-limited goals', () => {
    expect(HABIT_LIBRARY.filter((h) => h.endsAfterDays).map((h) => h.id)).toEqual(['challenge30']);
  });
});

describe('matchLibrary', () => {
  it.each([
    ['Run', 'run'],
    ['Run 20 km', 'run'],
    ['go for a run', 'run'],
    ['Read', 'read'],
    ['read 10 pages daily', 'read'],
    ['Meditate', 'meditate'],
    ['drink 2 litres water', 'water'],
    ['Workout', 'workout'],
    ['go to the gym', 'workout'],
    ['Deep clean', 'deepclean'],
    ['morning walk', 'walk'],
    ['10k steps', 'steps'],
    ['30 push ups a day', 'pushups'],
    ['Practise guitar', 'music'],
    ['30-day challenge', 'challenge30'],
  ])('%s is %s', (name, id) => {
    expect(named(name)).toBe(id);
  });

  it.each([
    ['paani peena', 'water'],
    ['roz paani peena', 'water'],
    ['kasrat', 'workout'],
    ['padhai', 'study'],
    ['padhai karna', 'study'],
    ['dhyan', 'meditate'],
    ['kitab padhna', 'read'],
    ['subah jaldi uthna', 'wakeup'],
    ['ghar ki safai', 'deepclean'],
    ['riyaz', 'music'],
  ])('knows the Hinglish name %s', (name, id) => {
    expect(named(name)).toBe(id);
  });

  it("returns nothing for a habit it doesn't know", () => {
    expect(named('Polish the telescope lenses')).toBeNull();
    expect(named('')).toBeNull();
    expect(named('20 km')).toBeNull();
  });
});

describe('coreWords', () => {
  it('drops amounts, units and how-often words', () => {
    expect(coreWords('Run 20 km daily')).toEqual(['run']);
    expect(coreWords('Read 10 pages every day')).toEqual(['read']);
    expect(coreWords('30 push ups')).toEqual([]);
    expect(coreWords('Workout 4 times a week')).toEqual(['workout']);
  });

  it('tidies case and punctuation', () => {
    expect(normalise('  Deep-Work!! ')).toBe('deep work');
  });
});

describe('suggestNames', () => {
  it('suggests habits as the name is typed', () => {
    expect(suggestNames('me')[0].id).toBe('meditate');
    expect(suggestNames('rea').map((h) => h.id)).toContain('read');
    expect(suggestNames('paani').map((h) => h.id)).toContain('water');
  });

  it('waits for 2 letters', () => {
    expect(suggestNames('r')).toEqual([]);
  });
});
