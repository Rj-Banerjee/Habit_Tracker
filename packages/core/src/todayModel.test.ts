import { describe, expect, it } from 'vitest';
import { TodayRow } from './api';
import {
  cardDetail,
  cardStatus,
  dayPart,
  eveningNote,
  greeting,
  groupByIdentity,
  levelOptions,
  levelTarget,
  progressLabel,
  repairDescription,
  repairOnLabel,
  showYesterdayFirst,
  celebrationText,
  completedSummary,
  streakUnit,
  weekLine,
} from './todayModel';

const row = (patch: Partial<TodayRow> = {}): TodayRow => ({
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
  levels: [],
  can_repair: false,
  repair_amount: null,
  ...patch,
});

describe('cardStatus', () => {
  it.each([
    ['pending', null, 'due'],
    ['done', 'full', 'done'],
    ['done', 'minimum', 'doneMinimum'],
    ['done', 'setup', 'doneMinimum'],
    ['skipped', null, 'skipped'],
    ['missed', null, 'missed'],
    ['repaired', null, 'repaired'],
    ['protected', null, 'protected'],
  ] as const)('maps %s at level %s to %s', (status, level, expected) => {
    expect(cardStatus(row({ status, level_done: level }))).toBe(expected);
  });
});

describe('groupByIdentity', () => {
  it('groups habits under their identity, keeping server order', () => {
    const groups = groupByIdentity([
      row({ habit_id: 'a', identity_id: 'i1', identity_name: 'The Athlete' }),
      row({ habit_id: 'b', identity_id: 'i2', identity_name: 'The Reader' }),
      row({ habit_id: 'c', identity_id: 'i1', identity_name: 'The Athlete' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['The Athlete', 'The Reader']);
    expect(groups[0].rows.map((r) => r.habit_id)).toEqual(['a', 'c']);
  });
});

describe('levels', () => {
  const levels = [
    { level: 'full' as const, description: 'Read 20 pages', target: 20 },
    { level: 'minimum' as const, description: 'Read 1 page', target: 1 },
  ];

  it('uses the target of the chosen level', () => {
    expect(levelTarget(row({ levels }), 'minimum')).toBe(1);
  });

  it('falls back to the habit target for the full version', () => {
    expect(levelTarget(row({ target: 5 }), 'full')).toBe(5);
  });

  it('always offers at least the full version', () => {
    expect(levelOptions(row()).map((l) => l.level)).toEqual(['full']);
  });

  it('describes what was done', () => {
    expect(cardDetail(row({ levels, level_done: 'minimum' }))).toBe('Read 1 page');
  });

  it('describes the target before anything is logged', () => {
    expect(cardDetail(row({ target: 5, unit: 'km' }))).toBe('5 km');
  });
});

describe('labels', () => {
  it('counts only what was logged', () => {
    expect(
      progressLabel([row({ status: 'done' }), row({ status: 'skipped' }), row()])
    ).toBe('1 of 3 done');
  });

  it('says when the day is complete', () => {
    expect(progressLabel([row({ status: 'done' })])).toBe('All done for today');
  });

  it('describes a repair with an amount', () => {
    expect(repairDescription(row({ repair_amount: 8, unit: 'pages' }))).toBe('Do 8 pages today');
  });

  it('describes a yes/no repair', () => {
    expect(repairDescription(row())).toBe('Do the full version, plus the minimum version again');
  });

  it.each([
    [0, 'morning', 'Good morning'],
    [11, 'morning', 'Good morning'],
    [12, 'afternoon', 'Good afternoon'],
    [17, 'afternoon', 'Good afternoon'],
    [18, 'evening', 'Good evening'],
    [23, 'evening', 'Good evening'],
  ] as const)('at hour %i it is %s', (hour, part, text) => {
    expect(dayPart(hour)).toBe(part);
    expect(greeting(dayPart(hour))).toBe(text);
  });

  it('treats an open day from yesterday as not logged yet, not due today', () => {
    expect(cardStatus(row({ is_today: false }))).toBe('open');
    expect(cardStatus(row())).toBe('due');
  });

  it.each([
    ['2026-11-05', 'Repair on Thu'],
    ['2026-11-09', 'Repair on Mon'],
    ['2027-01-03', 'Repair on Sun'],
  ])('labels a repair day of %s', (date, label) => {
    expect(repairOnLabel(date)).toBe(label);
  });

  it('flags a repair on the card', () => {
    expect(cardDetail(row({ can_repair: true }))).toBe('Repair available');
  });

  it('shows the skip reason on a skipped card', () => {
    expect(cardDetail(row({ status: 'skipped', skip_reason: 'Sick', target: 20, unit: 'pages' }))).toBe('Sick');
  });

  it('leads with yesterday only in the morning', () => {
    expect(showYesterdayFirst('morning')).toBe(true);
    expect(showYesterdayFirst('evening')).toBe(false);
  });

  it('counts what is left in the evening, gently', () => {
    expect(eveningNote([row(), row({ status: 'done' })])).toBe(
      '1 habit left today. A smaller version still counts.'
    );
    expect(eveningNote([row(), row()])).toBe('2 habits left today. A smaller version still counts.');
  });

  it('says nothing in the evening when nothing is left', () => {
    expect(eveningNote([row({ status: 'done' }), row({ status: 'skipped' })])).toBeNull();
  });
});

describe('times per week on Today', () => {
  const weekly = (patch: Partial<TodayRow> = {}) =>
    row({ frequency: 'per_week', week_done: 2, week_quota: 4, week_days_left: 5, ...patch });

  it('says how the week is going', () => {
    expect(weekLine(weekly())).toBe('This week: 2 of 4');
    expect(cardDetail(weekly())).toBe('This week: 2 of 4');
  });

  it('gives a calm hint only when it is tight', () => {
    expect(weekLine(weekly({ week_days_left: 3 }))).toBe('2 more this week, 3 days left');
    expect(weekLine(weekly({ week_done: 3, week_days_left: 1 }))).toBe('1 more this week, 1 day left');
    expect(weekLine(weekly({ week_days_left: 4 }))).toBe('This week: 2 of 4');
  });

  it('shows as done for the week once the quota is met, and counts in weeks', () => {
    const met = weekly({ week_done: 4, status: 'pending' });
    expect(weekLine(met)).toBe('Done for this week');
    expect(cardStatus(met)).toBe('done');
    expect(progressLabel([met])).toBe('All done for today');
    expect(streakUnit(met)).toBe('week');
    expect(streakUnit(row())).toBe('day');
  });

  it('is due until then', () => {
    expect(cardStatus(weekly())).toBe('due');
  });
});

describe('completed habits', () => {
  const read = {
    habit_id: 'h1', title: 'Read', identity_name: 'The Reader', colour_token: 'identity-1' as const,
    starts_on: '2026-10-01', ends_on: '2026-10-30', frequency: 'days' as const, days_done: 24,
    best_streak: 12, total_amount: 260, unit: 'pages', restarted: false,
  }; // prettier-ignore

  it('sums up how the run went', () => {
    expect(completedSummary(read)).toBe('24 days done, best streak 12 days, 260 pages in all.');
    expect(completedSummary({ ...read, frequency: 'per_week', best_streak: 1, total_amount: null })).toBe(
      '24 days done, best streak 1 week.'
    );
  });

  it('celebrates calmly', () => {
    expect(celebrationText(read)).toBe(
      "You finished Read. 24 days done, best streak 12 days, 260 pages in all. That's worth a moment."
    );
  });
});
