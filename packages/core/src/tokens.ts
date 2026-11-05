// Design tokens from the Design workflow section of PLAN.md. Components read
// these instead of hard-coding values. tokens.test.ts enforces the rules.

import type { ThemeData } from './theme';
import { DEFAULT_THEME } from './themes/default';

export type ThemeName = 'light' | 'dark';

export interface ThemeColors {
  canvas: string;
  surface: string;
  surfaceSunken: string;
  border: string;
  text: string;
  textMuted: string;
  hollow: string;
  scrim: string;
}

// Every value below comes from the default theme's data file, src/themes/default.ts.
export const colors: Record<ThemeName, ThemeColors> = {
  light: DEFAULT_THEME.modes.light.colors,
  dark: DEFAULT_THEME.modes.dark.colors,
};

export type IdentityToken =
  | 'identity-1'
  | 'identity-2'
  | 'identity-3'
  | 'identity-4'
  | 'identity-5'
  | 'identity-6'
  | 'identity-7'
  | 'identity-8';

export interface IdentityColor {
  label: string;
  // The accent on surfaces, and the check drawn on top of it.
  accent: string;
  onAccent: string;
  // A brighter tint of the accent, for the weld bead travelling along a repaired link.
  glow: string;
}

const mix = (from: string, to: string, amount: number) => {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * amount))
    .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
    .join('')}`;
};

const GLOW_TOWARD = '#FFF4DC';
const GLOW_AMOUNT = 0.45;

export const withGlow = (accents: Record<IdentityToken, Omit<IdentityColor, 'glow'>>) =>
  Object.fromEntries(
    Object.entries(accents).map(([token, colour]) => [
      token,
      { ...colour, glow: mix(colour.accent, GLOW_TOWARD, GLOW_AMOUNT) },
    ])
  ) as Record<IdentityToken, IdentityColor>;

export const identityColors: Record<ThemeName, Record<IdentityToken, IdentityColor>> = {
  light: withGlow(DEFAULT_THEME.modes.light.identity),
  dark: withGlow(DEFAULT_THEME.modes.dark.identity),
};

export const fonts = DEFAULT_THEME.typography.fonts;

// Three text sizes, plus a display size for the Future-Self letter.
export const textStylesFor = (typography: ThemeData['typography']) => {
  const style = (size: keyof ThemeData['typography']['sizes']) => {
    const { font, fontSize, lineHeight } = typography.sizes[size];
    return { fontFamily: typography.fonts[font], fontSize, lineHeight };
  };
  return { small: style('small'), body: style('body'), title: style('title'), display: style('display') };
};
export const textStyles = textStylesFor(DEFAULT_THEME.typography);

// Apply to anything that shows a number.
export const tabularNumerals = { fontVariant: ['tabular-nums' as const] };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = DEFAULT_THEME.radii;

export const layout = {
  minTouchTarget: 48,
  // Widths where layouts change, for tablets, desktop web and the desktop app.
  breakpoints: { wide: 768, desktop: 1100 },
  readingWidth: 560,
} as const;

export const motion = { checkOffMs: 260 } as const;
