import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AmountResult, TodayRow } from './api';
import { amountFromText, partialDetail, progressLine } from './amounts';
import { UNITS } from './units';

const result = (patch: Partial<AmountResult>): AmountResult => ({
  counted: true,
  added: 1,
  total: 1,
  unit: 'pages',
  said_unit: null,
  minimum: 2,
  target: 10,
  status: 'partial',
  level: null,
  repaired: false,
  ...patch,
});

describe('progressLine', () => {
  it('says where they stand below the minimum', () => {
    expect(progressLine(result({}), 'Read')).toBe('Read: 1 of 10 pages, 1 more for your minimum.');
  });

  it('says the minimum counts, and what the full needs', () => {
    expect(progressLine(result({ total: 3, status: 'done', level: 'minimum' }), 'Read')).toBe(
      'Read: 3 of 10 pages. The minimum counts. 7 more pages for the full version.'
    );
  });

  it('says when it is done, and when it repaired a miss', () => {
    expect(progressLine(result({ total: 11, status: 'done', level: 'full' }), 'Read')).toBe('Read: 11 of 10 pages. Done.');
    expect(progressLine(result({ total: 15, status: 'done', level: 'full', repaired: true }), 'Read')).toBe(
      'Read: 15 of 10 pages. Done. Streak repaired.'
    );
  });

  it('says it just is not added when the day already counts', () => {
    expect(
      progressLine(result({ counted: false, total: 3, said_unit: 'lines', status: 'done', level: 'minimum' }), 'Read')
    ).toBe("Lines can't count toward pages, so that isn't added. Read is at 3 of 10 pages.");
  });

  it('says calmly when a unit cannot count', () => {
    expect(progressLine(result({ counted: false, total: 0, said_unit: 'lines', status: 'none' }), 'Read')).toBe(
      "That's below your minimum: lines can't count toward pages. Read is at 0 of 10 pages."
    );
  });
});

describe('amountFromText', () => {
  it.each([
    ['3', 3, null],
    ['2-3 pages', 2, 'pages'],
    ['500 m', 500, 'm'],
    ['1,5', 1.5, null],
  ])('%s', (text, amount, unit) => {
    expect(amountFromText(text)).toEqual({ amount, unit });
  });

  it('refuses what is not an amount', () => {
    expect(amountFromText('')).toBeNull();
    expect(amountFromText('lots')).toBeNull();
    expect(amountFromText('-2')).toBeNull();
  });
});

describe('partialDetail', () => {
  const row = (patch: Partial<TodayRow>) => ({ status: 'pending', amount: 1, target: 10, unit: 'pages', ...patch }) as TodayRow;

  it('shows progress below the minimum on the card', () => {
    expect(partialDetail(row({}))).toBe('1 of 10 pages so far');
    expect(partialDetail(row({ amount: null }))).toBeUndefined();
    expect(partialDetail(row({ status: 'done' }))).toBeUndefined();
  });
});

describe('units on the server', () => {
  it('match units.ts, word for word', () => {
    const migration = readFileSync(join(__dirname, '../../../supabase/migrations/20261107000200_partial_logging.sql'), 'utf8');
    const rows = [...migration.matchAll(/\('([^']+)', '([^']+)', '(\w+)', ([\d.e-]+)\)/g)].map(
      ([, word, name, family, scale]) => `${word}|${name}|${family}|${Number(scale)}`
    );
    const seen = new Set<string>();
    const expected: string[] = [];
    for (const unit of UNITS) {
      for (const word of [unit.name, ...unit.says]) {
        if (seen.has(word)) continue;
        seen.add(word);
        expected.push(`${word}|${unit.name}|${unit.family}|${unit.scale}`);
      }
    }
    expect(rows).toEqual(expected);
  });
});
