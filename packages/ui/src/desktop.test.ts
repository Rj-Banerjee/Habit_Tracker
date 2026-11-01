import { layoutSize } from './desktop';

describe('layoutSize', () => {
  it.each([
    [390, 'compact'],
    [767, 'compact'],
    [768, 'wide'],
    [1099, 'wide'],
    [1100, 'desktop'],
  ])('at %ipx is %s', (width, size) => {
    expect(layoutSize(width)).toBe(size);
  });
});
