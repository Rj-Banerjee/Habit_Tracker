import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colors } from '@habit-tracker/core';

const css = readFileSync('src/app/globals.css', 'utf8').toLowerCase();

describe('globals.css', () => {
  it.each([
    ['light canvas', colors.light.canvas],
    ['dark canvas', colors.dark.canvas],
    ['light focus ring', colors.light.text],
    ['dark focus ring', colors.dark.text],
  ])('uses the token value for the %s', (_name, value) => {
    expect(css).toContain(value.toLowerCase());
  });
});
