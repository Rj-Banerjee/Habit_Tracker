import { describe, expect, it } from 'vitest';
import { DragSlot, dragTarget, orderAfterDrop } from './dragOrder';

// Morning: header at 0, cards a and b. Evening: header at 200, card c. 60px cards, 8px gaps.
const slots: DragSlot[] = [
  { key: 'h-morning', kind: 'header', time: 'morning', top: 0, height: 20 },
  { key: 'a', kind: 'card', time: 'morning', top: 28, height: 60 },
  { key: 'b', kind: 'card', time: 'morning', top: 96, height: 60 },
  { key: 'h-evening', kind: 'header', time: 'evening', top: 164, height: 20 },
  { key: 'c', kind: 'card', time: 'evening', top: 192, height: 60 },
];
const GAP = 8;

describe('dragTarget', () => {
  it('stays put when barely moved', () => {
    const target = dragTarget(slots, 'b', 96 + 30, GAP);
    expect(target).toMatchObject({ time: 'morning', index: 1 });
    expect(Object.values(target!.offsets).every((offset) => offset === 0)).toBe(true);
  });

  it('moving a card up pushes the one above it down', () => {
    const target = dragTarget(slots, 'b', 28 + 30, GAP);
    expect(target).toMatchObject({ time: 'morning', index: 0 });
    expect(target!.offsets).toEqual({ 'h-morning': 0, a: 68, 'h-evening': 0, c: 0 });
    // It lands where a was.
    expect(target!.landing).toBe(-68);
  });

  it('moving a card down into another section lifts everything it passes', () => {
    const target = dragTarget(slots, 'a', 192 + 60 + 30, GAP);
    expect(target).toMatchObject({ time: 'evening', index: 1 });
    expect(target!.offsets).toEqual({ 'h-morning': 0, b: -68, 'h-evening': -68, c: -68 });
  });

  it('moving a card up into another section pushes the rest down', () => {
    const target = dragTarget(slots, 'c', 28 + 30, GAP);
    expect(target).toMatchObject({ time: 'morning', index: 0 });
    expect(target!.offsets).toEqual({ 'h-morning': 0, a: 68, b: 68, 'h-evening': 68 });
  });

  it('drops into an empty section', () => {
    const withEmpty: DragSlot[] = [
      ...slots.slice(0, 3),
      { key: 'h-afternoon', kind: 'header', time: 'afternoon', top: 164, height: 20 },
      { key: 'e-afternoon', kind: 'empty', time: 'afternoon', top: 192, height: 48 },
      { key: 'h-evening', kind: 'header', time: 'evening', top: 248, height: 20 },
      { key: 'c', kind: 'card', time: 'evening', top: 276, height: 60 },
    ];
    expect(dragTarget(withEmpty, 'a', 248 - 68 + 30, GAP)).toMatchObject({ time: 'afternoon', index: 0 });
  });

  it('knows nothing of a card that is not there', () => {
    expect(dragTarget(slots, 'z', 0, GAP)).toBeNull();
  });
});

describe('orderAfterDrop', () => {
  it('puts the habit in its place among the others', () => {
    expect(orderAfterDrop(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(orderAfterDrop(['a', 'b'], 'x', 1)).toEqual(['a', 'x', 'b']);
    expect(orderAfterDrop(['a', 'b'], 'x', 9)).toEqual(['a', 'b', 'x']);
  });
});
