// Design tokens from the Design workflow section of PLAN.md. Components read
// these instead of hard-coding values. tokens.test.ts enforces the rules.

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

export const colors: Record<ThemeName, ThemeColors> = {
  light: {
    canvas: '#F4EFE7',
    surface: '#FBF8F2',
    surfaceSunken: '#EBE4D9',
    border: '#D9D0C2',
    text: '#2B2620',
    textMuted: '#655C50',
    hollow: '#857A6B',
    scrim: '#2B262066',
  },
  dark: {
    canvas: '#1D1A16',
    surface: '#28241F',
    surfaceSunken: '#332E28',
    border: '#463F36',
    text: '#F1EBE1',
    textMuted: '#B5AB9C',
    hollow: '#958A7B',
    scrim: '#0F0D0B99',
  },
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

const withGlow = (accents: Record<IdentityToken, Omit<IdentityColor, 'glow'>>) =>
  Object.fromEntries(
    Object.entries(accents).map(([token, colour]) => [
      token,
      { ...colour, glow: mix(colour.accent, GLOW_TOWARD, GLOW_AMOUNT) },
    ])
  ) as Record<IdentityToken, IdentityColor>;

export const identityColors: Record<ThemeName, Record<IdentityToken, IdentityColor>> = {
  light: withGlow({
    'identity-1': { label: 'Pine', accent: '#1D5C30', onAccent: '#FBF8F2' },
    'identity-2': { label: 'Lagoon', accent: '#237D7A', onAccent: '#FBF8F2' },
    'identity-3': { label: 'Harbour', accent: '#004CA9', onAccent: '#FBF8F2' },
    'identity-4': { label: 'Iris', accent: '#7C66A5', onAccent: '#FBF8F2' },
    'identity-5': { label: 'Plum', accent: '#832D77', onAccent: '#FBF8F2' },
    'identity-6': { label: 'Ochre', accent: '#8E6B00', onAccent: '#FBF8F2' },
    'identity-7': { label: 'Copper', accent: '#833D0A', onAccent: '#FBF8F2' },
    'identity-8': { label: 'Stone', accent: '#4D514D', onAccent: '#FBF8F2' },
  }),
  dark: withGlow({
    'identity-1': { label: 'Pine', accent: '#91D8A8', onAccent: '#1D1A16' },
    'identity-2': { label: 'Lagoon', accent: '#1FDDF3', onAccent: '#1D1A16' },
    'identity-3': { label: 'Harbour', accent: '#52A2FB', onAccent: '#1D1A16' },
    'identity-4': { label: 'Iris', accent: '#A38AD0', onAccent: '#1D1A16' },
    'identity-5': { label: 'Plum', accent: '#FBA0E0', onAccent: '#1D1A16' },
    'identity-6': { label: 'Ochre', accent: '#AE9F3D', onAccent: '#1D1A16' },
    'identity-7': { label: 'Copper', accent: '#CA8B63', onAccent: '#1D1A16' },
    'identity-8': { label: 'Stone', accent: '#859C8B', onAccent: '#1D1A16' },
  }),
};

export const fonts = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semiBold: 'Figtree_600SemiBold',
} as const;

// Three text sizes, plus a display size for the Future-Self letter.
export const textStyles = {
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  title: { fontFamily: fonts.semiBold, fontSize: 21, lineHeight: 27 },
  display: { fontFamily: fonts.semiBold, fontSize: 36, lineHeight: 42 },
} as const;

// Apply to anything that shows a number.
export const tabularNumerals = { fontVariant: ['tabular-nums' as const] };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 14, full: 999 } as const;

export const layout = {
  minTouchTarget: 48,
  // Widths where layouts change, for tablets, desktop web and the desktop app.
  breakpoints: { wide: 768, desktop: 1100 },
  readingWidth: 560,
} as const;

export const motion = { checkOffMs: 260 } as const;
