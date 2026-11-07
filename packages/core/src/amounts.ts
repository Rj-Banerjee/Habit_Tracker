import type { AmountResult, TodayRow } from './api';
import { parseAmount } from './habitSetup';

// What an amount log says back: always where they stand and what's left. Calm either way.

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const format = (value: number) => String(Math.round(value * 100) / 100);
const plural = (unit: string | null) => (unit ? ` ${unit}` : '');

export function progressLine(result: AmountResult, title: string): string {
  const unit = plural(result.unit);
  const so = (total: number) =>
    result.target !== null ? `${format(total)} of ${format(result.target)}${unit}` : `${format(total)}${unit}`;

  if (!result.counted) {
    const said = result.said_unit ?? 'That';
    const why = `${said} can't count toward ${result.unit ?? title}`;
    // Already counting today: it just isn't added.
    if (result.status === 'done') return `${capitalise(why)}, so that isn't added. ${title} is at ${so(result.total)}.`;
    return `That's below your minimum: ${why}. ${title} is at ${so(result.total)}.`;
  }
  const repaired = result.repaired ? ' Streak repaired.' : '';
  if (result.status === 'done' && result.level === 'full') {
    return `${title}: ${so(result.total)}. Done.${repaired}`;
  }
  if (result.status === 'done') {
    const left = result.target !== null ? ` ${format(result.target - result.total)} more${unit} for the full version.` : '';
    return `${title}: ${so(result.total)}. The minimum counts.${left}${repaired}`;
  }
  const toMinimum = result.minimum !== null ? result.minimum - result.total : null;
  const left = toMinimum !== null && toMinimum > 0 ? `, ${format(toMinimum)} more for your minimum` : '';
  return `${title}: ${so(result.total)}${left}.`;
}

// "3", "2-3 pages" or "500 m" typed in the amount box. Ranges use the lower number.
export function amountFromText(text: string): { amount: number; unit: string | null } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const found = parseAmount(trimmed);
  if (found) return { amount: found.amount, unit: found.unit };
  const plain = Number(trimmed.replace(',', '.'));
  return Number.isFinite(plain) && plain > 0 ? { amount: plain, unit: null } : null;
}

// A day with progress below the minimum shows how far it got.
export function partialDetail(row: TodayRow): string | undefined {
  if (row.amount === null || row.amount <= 0 || (row.status !== 'pending' && row.status !== 'partial')) {
    return undefined;
  }
  const of = row.target !== null ? ` of ${format(row.target)}` : '';
  return `${format(row.amount)}${of}${plural(row.unit)} so far`;
}
