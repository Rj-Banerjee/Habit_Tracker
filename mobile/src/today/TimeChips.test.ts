import { chipAt, ChipRect } from './TimeChips';

const rects: ChipRect[] = [
  { filter: 'all', x: 16, y: 200, width: 60, height: 44 },
  { filter: 'morning', x: 84, y: 200, width: 120, height: 44 },
  { filter: 'evening', x: 212, y: 200, width: 110, height: 44 },
];

describe('chipAt', () => {
  it('finds the chip under the finger, with a little room above and below', () => {
    expect(chipAt(rects, 100, 220)).toBe('morning');
    expect(chipAt(rects, 250, 196)).toBe('evening');
    expect(chipAt(rects, 30, 250)).toBe('all');
  });

  it('is nothing between or away from the chips', () => {
    expect(chipAt(rects, 80, 220)).toBeNull();
    expect(chipAt(rects, 100, 400)).toBeNull();
    expect(chipAt([], 100, 220)).toBeNull();
  });
});
