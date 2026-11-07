import { describe, expect, it } from 'vitest';
import {
  Connection,
  headsUpText,
  linkWidth,
  mapHabits,
  mapLayout,
  mapLinks,
  subjectName,
  warningText,
} from './connections';

const connection = (patch: Partial<Connection> = {}): Connection => ({
  id: 'f1',
  kind: 'after_big_amount',
  key: 'after_big_amount:run:study',
  subjects: [
    { type: 'habit', id: 'run', title: 'Run' },
    { type: 'habit', id: 'study', title: 'Study' },
  ],
  direction: 'competes',
  effect: -0.45,
  sample: 60,
  confidence: 'high',
  range_from: '2026-09-01',
  range_to: '2026-11-08',
  numbers: { after_big: 40, otherwise: 85 },
  explanation: 'After a long Run, Study is 40% against 85%. They seem linked.',
  question: 'Does a long Run leave less room for Study?',
  fixes: [],
  answer: null,
  ...patch,
});

describe('Habit connections', () => {
  it('words the morning heads-up with the real numbers', () => {
    expect(
      headsUpText({
        finding_id: 'f1', key: 'k', kind: 'after_big_amount', a_id: 'run', a_title: 'Run', b_id: 'study',
        b_title: 'Study', numbers: { after_big: 40, otherwise: 85 },
      }) // prettier-ignore
    ).toBe("Heads-up: after a big Run yesterday, Study often slips (40% against 85%). Make today's Study just the minimum?");
  });

  it('warns firmly but kindly, never blaming', () => {
    const text = warningText({
      kind: 'overload',
      habit: 'Cold shower',
      slipping: [
        { title: 'Read', before: 80, after: 40 },
        { title: 'Walk', before: 70, after: 35 },
      ],
    });
    expect(text).toMatch(/^Since Cold shower started, Read and Walk have both slipped/);
    expect(text).toMatch(/not of you/);
    expect(warningText({ kind: 'dragging', habit: 'Run', slipping: ['Study', 'Read'] })).toMatch(/seems linked/);
    for (const kind of ['overload', 'dragging', 'declining'] as const) {
      expect(warningText({ kind, habit: 'Run', slipping: ['Read', 'Walk'] })).not.toMatch(/fail|lazy|should have/i);
    }
  });

  it('places habits around a circle, from the top', () => {
    const nodes = mapLayout([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }, { id: 'd', title: 'D' }], 200, 20);
    expect(nodes[0]).toMatchObject({ x: 100, y: 20 });
    expect(nodes[1].x).toBeCloseTo(180);
    expect(nodes[2].y).toBeCloseTo(180);
    expect(mapLayout([{ id: 'a', title: 'A' }], 200, 20)[0]).toMatchObject({ x: 100, y: 100 });
  });

  it('draws stronger links thicker', () => {
    expect(linkWidth(0.1)).toBeLessThan(linkWidth(0.5));
    expect(linkWidth(-0.9)).toBe(8);
    expect(linkWidth(0)).toBe(2);
  });

  it('maps links between two habits, and leaves signals off the map', () => {
    const signal = connection({ id: 'f2', kind: 'signal', subjects: [{ type: 'signal', name: 'energy' }, { type: 'habit', id: 'study', title: 'Study' }] });
    expect(mapLinks([connection(), signal]).map((l) => [l.from, l.to])).toEqual([['run', 'study']]);
    expect(mapHabits([connection(), signal]).map((h) => h.title)).toEqual(['Run', 'Study']);
    expect(subjectName({ type: 'signal', name: 'energy' })).toBe('Energy');
  });
});
