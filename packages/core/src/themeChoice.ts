// What someone picked in Settings: a theme, and optionally another typeface and their own
// colour for any identity. Saved as JSON on the device. buildTheme turns it into a theme,
// and anything unknown, or a mix that fails validateTheme, falls back rather than show.

import { loadTheme, ThemeData } from './theme';
import { DEFAULT_THEME } from './themes/default';
import { FONT_FAMILIES, FontFamilyId } from './themes/fonts';
import { STANDARD_THEMES } from './themes/standard';
import { IDENTITY_TOKENS } from './habitForm';
import type { IdentityToken, ThemeName } from './tokens';

// Colours an identity can take: the eight defaults and four more, each with a light and a
// dark version at the same lightness as the defaults, so they read the same on every theme.
export const ACCENT_SWATCHES = {
  pine: { label: 'Pine', light: '#1D5C30', dark: '#91D8A8' },
  lagoon: { label: 'Lagoon', light: '#237D7A', dark: '#1FDDF3' },
  harbour: { label: 'Harbour', light: '#004CA9', dark: '#52A2FB' },
  iris: { label: 'Iris', light: '#7C66A5', dark: '#A38AD0' },
  plum: { label: 'Plum', light: '#832D77', dark: '#FBA0E0' },
  ochre: { label: 'Ochre', light: '#8E6B00', dark: '#AE9F3D' },
  copper: { label: 'Copper', light: '#833D0A', dark: '#CA8B63' },
  stone: { label: 'Stone', light: '#4D514D', dark: '#859C8B' },
  jade: { label: 'Jade', light: '#175C45', dark: '#28A97E' },
  indigo: { label: 'Indigo', light: '#3939CD', dark: '#8D8DE4' },
  orchid: { label: 'Orchid', light: '#812594', dark: '#CC73DE' },
  olive: { label: 'Olive', light: '#4D5515', dark: '#8E9E25' },
} as const;

export type AccentId = keyof typeof ACCENT_SWATCHES;
export const ACCENT_IDS = Object.keys(ACCENT_SWATCHES) as AccentId[];

export interface ThemeChoice {
  themeId: string;
  font?: FontFamilyId;
  accents?: Partial<Record<IdentityToken, AccentId>>;
}

export const DEFAULT_THEME_CHOICE: ThemeChoice = { themeId: DEFAULT_THEME.id };

export const themeById = (id: string) => STANDARD_THEMES.find((t) => t.id === id);

// Reads a saved choice, keeping only the parts that still mean something.
export function parseThemeChoice(raw: unknown): ThemeChoice {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return DEFAULT_THEME_CHOICE;
    }
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_THEME_CHOICE;
  const v = value as Record<string, unknown>;
  const choice: ThemeChoice = {
    themeId: typeof v.themeId === 'string' && themeById(v.themeId) ? v.themeId : DEFAULT_THEME.id,
  };
  if (typeof v.font === 'string' && v.font in FONT_FAMILIES) choice.font = v.font as FontFamilyId;
  if (typeof v.accents === 'object' && v.accents !== null) {
    const accents: Partial<Record<IdentityToken, AccentId>> = {};
    for (const token of IDENTITY_TOKENS) {
      const id = (v.accents as Record<string, unknown>)[token];
      if (typeof id === 'string' && id in ACCENT_SWATCHES) accents[token] = id as AccentId;
    }
    if (Object.keys(accents).length > 0) choice.accents = accents;
  }
  return choice;
}

export function buildTheme(choice: ThemeChoice): ThemeData {
  const base = themeById(choice.themeId) ?? DEFAULT_THEME;
  const mode = (name: ThemeName) => {
    const m = base.modes[name];
    const identity = { ...m.identity };
    for (const [token, id] of Object.entries(choice.accents ?? {}) as [IdentityToken, AccentId][]) {
      const swatch = ACCENT_SWATCHES[id];
      identity[token] = { ...identity[token], label: swatch.label, accent: swatch[name] };
    }
    return { ...m, identity };
  };
  const themed: ThemeData = {
    ...base,
    modes: { light: mode('light'), dark: mode('dark') },
    typography: choice.font ? { ...base.typography, fonts: FONT_FAMILIES[choice.font].fonts } : base.typography,
  };
  return loadTheme(themed, base).theme;
}
