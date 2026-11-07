import { describe, expect, it } from 'vitest';
import type { DayStatus, WeekStatusRow } from './api';
import { addDays } from './dates';
import {
  buildChain,
  buildWeekChain,
  finishCaption,
  Chain,
  chainBefore,
  chainRows,
  habitChain,
  fractureCaption,
  isLowEnd,
  longestWeekRun,
  momentKey,
  motionPlan,
  planMoments,
  repairHint,
  seamLabel,
  seamLabels,
  weekRepairHint,
  weldCaption,
} from './chain';

const TODAY = '2026-11-12'; // a Thursday

const day = (date: string, status: string, repair_on: string | null = null): DayStatus => ({
  habit_id: 'h1',
  date,
  status,
  repair_on,
});

// Mon 2 Nov to Thu 12 Nov.
type Override = [status: string, repairOn?: string | null];
const week = (overrides: Record<string, Override> = {}) => {
  const days: DayStatus[] = [];
  for (let d = 2; d <= 12; d += 1) {
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    const [status, repairOn] = overrides[date] ?? [date === TODAY ? 'pending' : 'done'];
    days.push(day(date, status, repairOn ?? null));
  }
  return days;
};

const chainOf = (overrides: Record<string, Override> = {}) =>
  buildChain(week(overrides), [], TODAY);

const read = { title: 'Read', type: 'count' as const, target: 30, unit: 'pages' };
const run = { title: 'Run', type: 'boolean' as const, target: null, unit: null };

describe('buildChain', () => {
  it('shows the last 7 scheduled days, oldest first, ending today', () => {
    const { nodes, links } = chainOf();
    expect(nodes.map((n) => n.date)).toEqual([
      '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12',
    ]);
    expect(nodes.at(-1)?.status).toBe('due');
    expect(links).toEqual(['chain', 'chain', 'chain', 'chain', 'chain', 'pending']);
  });

  it('leaves out unscheduled days rather than drawing them as gaps', () => {
    const { nodes } = chainOf({ '2026-11-08': ['unscheduled'] });
    expect(nodes.map((n) => n.date)).not.toContain('2026-11-08');
    expect(nodes).toHaveLength(7);
  });

  it('uses the same states as the habit card', () => {
    const { nodes } = buildChain(
      week({
        '2026-11-06': ['skipped'],
        '2026-11-07': ['protected'],
        '2026-11-08': ['repaired'],
        '2026-11-11': ['pending'],
      }),
      [{ date: '2026-11-10', level_done: 'minimum' }],
      TODAY
    );
    expect(nodes.map((n) => n.status)).toEqual([
      'skipped', 'protected', 'repaired', 'done', 'doneMinimum', 'open', 'due',
    ]);
  });

  it('cracks the link into a miss that can still be repaired', () => {
    const { links } = chainOf({ '2026-11-10': ['missed', '2026-11-11'] });
    expect(links[3]).toBe('crack');
  });

  it('leaves a quiet gap once the repair day has passed', () => {
    const { links } = chainOf({ '2026-11-09': ['missed'] });
    expect(links[2]).toBe('gap');
  });

  it('stitches a repaired link, with what the repair took', () => {
    const { nodes, links } = buildChain(
      week({ '2026-11-09': ['repaired'] }),
      [{ date: '2026-11-10', level_done: 'full', amount: 45 }],
      TODAY
    );
    expect(links[2]).toBe('seam');
    expect(nodes[3].repairedWith).toEqual({ on: '2026-11-10', amount: 45 });
  });

  it('keeps a skip and a Grace Day in the chain', () => {
    const { links } = chainOf({ '2026-11-09': ['skipped'], '2026-11-10': ['protected'] });
    expect(links[2]).toBe('chain');
    expect(links[3]).toBe('chain');
  });
});

describe('planMoments', () => {
  const crack: Record<string, Override> = { '2026-11-10': ['missed', '2026-11-11'] };
  const repaired: Record<string, Override> = { '2026-11-10': ['repaired'] };
  const one = (chain: Chain, habitId = 'h1') => [{ habitId, chain }];
  const seen = (...keys: string[]) => new Set(keys);

  it('never plays history the first time it looks', () => {
    const plan = planMoments(one(chainOf(crack)), null);
    expect(plan.play).toEqual([]);
    expect(plan.welcomeBack).toEqual([]);
    expect(plan.quiet).toEqual(['fracture:h1:2026-11-10']);
  });

  it('plays a fracture once a miss is final and still repairable', () => {
    const plan = planMoments(one(chainOf(crack)), seen());
    expect(plan.play).toEqual([{ kind: 'fracture', habitId: 'h1', date: '2026-11-10' }]);
  });

  it('plays it only once', () => {
    const plan = planMoments(one(chainOf(crack)), seen('fracture:h1:2026-11-10'));
    expect(plan.play).toEqual([]);
  });

  it('plays nothing while the back-log window is still open', () => {
    // Before the window closes the server still calls the day pending.
    const plan = planMoments(one(chainOf({ '2026-11-11': ['pending'] })), seen());
    expect(plan.play).toEqual([]);
  });

  it('settles a missed repair day quietly, with no animation', () => {
    const plan = planMoments(one(chainOf({ '2026-11-09': ['missed'] })), seen());
    expect(plan.play).toEqual([]);
    expect(plan.quiet).toEqual(['fracture:h1:2026-11-09']);
  });

  it('welds after a repair from any source, even if the crack was never seen', () => {
    const plan = planMoments(one(chainOf(repaired)), seen());
    expect(plan.play).toEqual([{ kind: 'weld', habitId: 'h1', date: '2026-11-10' }]);
  });

  it('welds after the fracture it fixes was already seen', () => {
    const plan = planMoments(one(chainOf(repaired)), seen('fracture:h1:2026-11-10'));
    expect(plan.play.map((m) => m.kind)).toEqual(['weld']);
  });

  it('shimmers a Grace Day once', () => {
    const chain = chainOf({ '2026-11-10': ['protected'] });
    expect(planMoments(one(chain), seen()).play.map((m) => m.kind)).toEqual(['protected']);
    expect(planMoments(one(chain), seen('protected:h1:2026-11-10')).play).toEqual([]);
  });

  it('plays one moment per habit, the weld first, and covers the rest', () => {
    const chain = chainOf({ '2026-11-07': ['protected'], '2026-11-10': ['repaired'] });
    const plan = planMoments(one(chain), seen());
    expect(plan.play.map((m) => m.kind)).toEqual(['weld']);
    expect(plan.quiet).toContain('protected:h1:2026-11-07');
  });

  it('never plays fractures in a row: two habits cracked means one welcome back', () => {
    const plan = planMoments(
      [
        { habitId: 'h1', chain: chainOf(crack) },
        { habitId: 'h2', chain: chainOf({ '2026-11-10': ['protected'] }) },
      ],
      seen()
    );
    expect(plan.play).toEqual([]);
    expect(plan.welcomeBack.map((m) => m.kind).sort()).toEqual(['fracture', 'protected']);
  });

  it('folds a weld into the welcome back when a crack is waiting too', () => {
    const plan = planMoments(
      [
        { habitId: 'h1', chain: chainOf(crack) },
        { habitId: 'h2', chain: chainOf(repaired) },
      ],
      seen()
    );
    expect(plan.play).toEqual([]);
    expect(plan.welcomeBack).toHaveLength(2);
  });

  it('plays two welds on two habits, since nothing broke', () => {
    const plan = planMoments(
      [
        { habitId: 'h1', chain: chainOf(repaired) },
        { habitId: 'h2', chain: chainOf(repaired) },
      ],
      seen()
    );
    expect(plan.play).toHaveLength(2);
  });

  it('keys moments by kind, habit and day', () => {
    expect(momentKey({ kind: 'weld', habitId: 'h1', date: '2026-11-10' })).toBe('weld:h1:2026-11-10');
  });
});

describe('words', () => {
  it('names the crack and the repair day', () => {
    expect(fractureCaption('2026-11-10', '2026-11-12')).toBe('Cracked on Tue · Repair on Thu');
    expect(fractureCaption('2026-11-10', null)).toBe('Cracked on Tue');
  });

  it('gives the 1.5x target, rounded up', () => {
    expect(repairHint(read, '2026-11-12')).toBe('Read 45 pages on Thu');
    expect(repairHint({ ...read, target: 5, unit: 'km' }, '2026-11-12')).toBe('Read 8 km on Thu');
  });

  it('asks for the full and minimum versions on a yes/no habit', () => {
    expect(repairHint(run, '2026-11-12')).toBe('Do the full and minimum versions on Thu');
  });

  it('says how the seam was earned', () => {
    const node = {
      date: '2026-11-10',
      status: 'repaired' as const,
      repairOn: null,
      repairedWith: { on: '2026-11-12', amount: 45 },
    };
    expect(seamLabel(node, read)).toBe('Repaired on Thu with 45 pages');
    expect(seamLabel({ ...node, repairedWith: { on: '2026-11-12', amount: null } }, run)).toBe(
      'Repaired on Thu with the full and minimum versions'
    );
  });

  it('celebrates calmly', () => {
    expect(weldCaption(12)).toBe('Welded. 12-day streak.');
  });
});

describe('motionPlan', () => {
  it('plays in full, with sparks only on a weld', () => {
    expect(motionPlan('weld', { reducedMotion: false, lowEnd: false })).toEqual({
      mode: 'full',
      sparks: true,
      durationMs: 900,
    });
    expect(motionPlan('fracture', { reducedMotion: false, lowEnd: false }).sparks).toBe(false);
  });

  it('skips the sparks on a low-end phone', () => {
    expect(motionPlan('weld', { reducedMotion: false, lowEnd: true }).sparks).toBe(false);
  });

  it('only crossfades with reduced motion', () => {
    expect(motionPlan('weld', { reducedMotion: true, lowEnd: false })).toEqual({
      mode: 'crossfade',
      sparks: false,
      durationMs: 150,
    });
  });

  it('slows everything for review', () => {
    expect(motionPlan('fracture', { reducedMotion: false, lowEnd: false, slow: 4 }).durationMs).toBe(2400);
  });

  it('counts a 3 GB phone as low-end', () => {
    expect(isLowEnd(2.8 * 1024 ** 3)).toBe(true);
    expect(isLowEnd(6 * 1024 ** 3)).toBe(false);
    expect(isLowEnd(null)).toBe(false);
  });
});

describe('chainBefore', () => {
  it('starts a fracture from an unlogged day on an unbroken link', () => {
    const chain = chainOf({ '2026-11-10': ['missed', '2026-11-11'] });
    const before = chainBefore(chain, { kind: 'fracture', habitId: 'h1', date: '2026-11-10' });
    expect(before.nodes[4].status).toBe('open');
    expect(before.links[3]).toBe('chain');
  });

  it('starts a weld from the crack it closes', () => {
    const chain = buildChain(week({ '2026-11-10': ['repaired'] }), [{ date: '2026-11-11', level_done: 'full', amount: 45 }], TODAY);
    const before = chainBefore(chain, { kind: 'weld', habitId: 'h1', date: '2026-11-10' });
    expect(before.nodes[4].status).toBe('missed');
    expect(before.links[3]).toBe('crack');
  });

  it('leaves a Grace Day as it is, since only the shield shimmers', () => {
    const chain = chainOf({ '2026-11-10': ['protected'] });
    expect(chainBefore(chain, { kind: 'protected', habitId: 'h1', date: '2026-11-10' })).toBe(chain);
  });
});

describe('chainRows', () => {
  it('splits a long chain without links across the break', () => {
    const long = buildChain(week(), [], TODAY, 11);
    const rows = chainRows(long, 5);
    expect(rows.map((r) => r.nodes.length)).toEqual([5, 5, 1]);
    expect(rows.map((r) => r.links.length)).toEqual([4, 4, 0]);
  });
});

describe('habitChain', () => {
  it("builds one habit's chain from Progress rows, with repair days from the statuses", () => {
    const days = week({ '2026-11-10': ['missed'] }).map((d) => ({
      ...d,
      level_done: d.status === 'done' ? ('full' as const) : null,
      amount: null,
      target: null,
    }));
    const other = { ...days[0], habit_id: 'h2' };
    const chain = habitChain('h1', [...days, other], TODAY, 7, [day('2026-11-10', 'missed', '2026-11-11')]);
    expect(chain.nodes).toHaveLength(7);
    expect(chain.links[3]).toBe('crack');
    expect(habitChain('h1', days, TODAY).links[3]).toBe('gap');
  });
});

describe('seamLabels', () => {
  it('labels each repaired day by date', () => {
    const labels = seamLabels(
      week({ '2026-11-04': ['repaired'] }),
      [{ date: '2026-11-05', level_done: 'full', amount: 45 }],
      read,
      TODAY
    );
    expect([...labels]).toEqual([['2026-11-04', 'Repaired on Thu with 45 pages']]);
  });
});

describe('a chain of weeks', () => {
  const week = (week_start: string, status: WeekStatusRow['status'], patch: Partial<WeekStatusRow> = {}): WeekStatusRow => ({
    habit_id: 'h1', week_start, status, quota: 4, sessions: status === 'met' ? 4 : 2, repair_by: null, ...patch,
  }); // prettier-ignore

  it('has a node a week: met, missed and repairable, covered, repaired, and this one', () => {
    const chain = buildWeekChain('h1', [
      week('2026-10-12', 'met'),
      week('2026-10-19', 'protected'),
      week('2026-10-26', 'repaired'),
      week('2026-11-02', 'met', { sessions: 5 }),
      week('2026-11-09', 'missed', { repair_by: '2026-11-16' }),
      week('2026-11-16', 'pending'),
    ]);
    expect(chain.unit).toBe('week');
    expect(chain.nodes.map((n) => n.status)).toEqual(['done', 'protected', 'repaired', 'done', 'missed', 'due']);
    expect(chain.links).toEqual(['chain', 'seam', 'chain', 'crack', 'pending']);
    expect(chain.nodes[4].repairOn).toBe('2026-11-16');
    expect(chain.nodes[2].repairedWith).toEqual({ on: '2026-11-02', amount: 5 });
  });

  it('keeps the last 6 weeks, and only its own', () => {
    const weeks = Array.from({ length: 9 }, (_, i) => week(addDays('2026-09-07', i * 7), 'met'));
    expect(buildWeekChain('h1', [...weeks, { ...week('2026-11-09', 'met'), habit_id: 'h2' }]).nodes).toHaveLength(6);
  });

  it('plays the same moments for weeks', () => {
    const chain = buildWeekChain('h1', [week('2026-11-02', 'met'), week('2026-11-09', 'missed', { repair_by: '2026-11-16' })]);
    expect(planMoments([{ habitId: 'h1', chain }], new Set()).play).toEqual([
      { kind: 'fracture', habitId: 'h1', date: '2026-11-09' },
    ]);
  });

  it('talks in weeks', () => {
    expect(fractureCaption('2026-11-09', '2026-11-16', 'week')).toBe('Missed the week of 9 Nov · Repair next week');
    expect(fractureCaption('2026-11-09', null, 'week')).toBe('Missed the week of 9 Nov');
    expect(weekRepairHint(4)).toBe('5 sessions next week, one more than it asks');
    expect(weldCaption(6, 'week')).toBe('Welded. 6-week streak.');
    const repaired = { date: '2026-10-26', status: 'repaired' as const, repairOn: null, repairedWith: { on: '2026-11-02', amount: 5 } };
    expect(seamLabel(repaired, { title: 'Workout', type: 'boolean', target: null, unit: null }, 'week')).toBe(
      'Repaired the next week with 5 sessions'
    );
  });
});

describe('a day below the minimum', () => {
  it('shows how far it got on its node', () => {
    const chain = buildChain(
      [day('2026-11-10', 'done'), day('2026-11-11', 'missed', '2026-11-12')],
      [
        { date: '2026-11-10', level_done: 'full' },
        { date: '2026-11-11', level_done: null, amount: 3, target: 10 },
      ],
      TODAY
    );
    expect(chain.nodes[1]).toMatchObject({ status: 'missed', partial: 0.3 });
    expect(chain.nodes[0].partial).toBeUndefined();
  });

  it('never shows nothing, or looks finished', () => {
    const tiny = buildChain([day('2026-11-11', 'missed')], [{ date: '2026-11-11', level_done: null, amount: 0.1, target: 10 }], TODAY);
    const most = buildChain([day('2026-11-11', 'missed')], [{ date: '2026-11-11', level_done: null, amount: 9.9, target: 10 }], TODAY);
    expect(tiny.nodes[0].partial).toBe(0.1);
    expect(most.nodes[0].partial).toBe(0.9);
  });
});

describe('finishing', () => {
  it('has its own calm moment, never planned from a chain', () => {
    expect(motionPlan('finish', { reducedMotion: false, lowEnd: false })).toEqual({ mode: 'full', sparks: false, durationMs: 700 });
    expect(motionPlan('finish', { reducedMotion: true, lowEnd: false }).mode).toBe('crossfade');
    expect(finishCaption(24)).toBe('Finished. 24 days done.');
  });

  it('starts from the chain without its cap', () => {
    const chain = { ...buildChain([day('2026-11-11', 'done')], [], TODAY), ended: true };
    expect(chainBefore(chain, { kind: 'finish', habitId: 'h1', date: '2026-11-11' }).ended).toBe(false);
  });
});

describe('longestWeekRun', () => {
  it('counts met and repaired weeks, through a covered one, until a miss', () => {
    const w = (week_start: string, status: WeekStatusRow['status']): WeekStatusRow => ({ habit_id: 'h1', week_start, status, quota: 3, sessions: 0, repair_by: null });
    expect(longestWeekRun('h1', [w('2026-10-05', 'met'), w('2026-10-12', 'protected'), w('2026-10-19', 'repaired'), w('2026-10-26', 'missed'), w('2026-11-02', 'met')])).toBe(2);
  });
});

describe('chainRows', () => {
  it('keeps the unit, and the cap on the last row only', () => {
    const chain = { ...buildChain([day('2026-11-10', 'done'), day('2026-11-11', 'done'), day('2026-11-12', 'done')], [], TODAY), ended: true, unit: 'week' as const };
    const rows = chainRows(chain, 2);
    expect(rows.map((r) => [r.unit, r.ended])).toEqual([['week', undefined], ['week', true]]);
  });
});
