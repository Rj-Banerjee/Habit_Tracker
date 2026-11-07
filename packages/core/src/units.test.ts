import { describe, expect, it } from 'vitest';
import { convertAmount, findUnit, unitName } from './units';

describe('units', () => {
  it('knows what people type and say', () => {
    expect(findUnit('KMs')?.name).toBe('km');
    expect(findUnit('ghante')?.name).toBe('hours');
    expect(findUnit('push ups')?.name).toBe('push-ups');
    expect(findUnit('lightyears')).toBeNull();
    expect(unitName('Pages')).toBe('pages');
    expect(unitName('Laps')).toBe('laps');
  });

  it.each([
    [500, 'm', 'km', 0.5],
    [2, 'km', 'm', 2000],
    [1.5, 'hours', 'min', 90],
    [30, 'min', 'hours', 0.5],
    [500, 'ml', 'litres', 0.5],
    [2, 'litres', 'ml', 2000],
    [3, 'pages', 'pages', 3],
    [3, 'page', 'pages', 3],
  ])('converts %s %s to %s', (amount, from, to, expected) => {
    expect(convertAmount(amount, from, to)).toBe(expected);
  });

  it("won't compare units that don't match", () => {
    expect(convertAmount(2, 'lines', 'pages')).toBeNull();
    expect(convertAmount(2, 'km', 'min')).toBeNull();
    expect(convertAmount(2, 'glasses', 'litres')).toBeNull();
    expect(convertAmount(2, 'laps', 'pages')).toBeNull();
  });

  it('takes an amount with no unit as the habit’s own', () => {
    expect(convertAmount(4, null, 'pages')).toBe(4);
    expect(convertAmount(4, 'pages', null)).toBe(4);
  });
});
