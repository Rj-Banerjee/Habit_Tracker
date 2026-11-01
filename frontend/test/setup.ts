import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
})) as unknown as typeof window.matchMedia;

// jsdom has no layout, so give react-native-web a desktop window to measure.
Object.defineProperty(document.documentElement, 'clientWidth', { value: 1400, configurable: true });
Object.defineProperty(document.documentElement, 'clientHeight', { value: 900, configurable: true });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
