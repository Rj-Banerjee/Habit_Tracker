// A theme is data: colours for light and dark, typography, corner radii, and optional images
// and sounds. It can ship with the app or be downloaded, and validateTheme checks it before
// use, so a broken or unreadable theme falls back to the default instead of reaching the screen.

import { contrast } from './colorChecks';
import { IDENTITY_TOKENS } from './habitForm';
import type { IdentityToken, ThemeColors, ThemeName } from './tokens';

export interface ThemeIdentity {
  label: string;
  accent: string;
  onAccent: string;
}

export interface ThemeMode {
  colors: ThemeColors;
  identity: Record<IdentityToken, ThemeIdentity>;
}

export type FontRole = 'regular' | 'medium' | 'semiBold';
export type TextSize = 'small' | 'body' | 'title' | 'display';

export interface ThemeData {
  id: string;
  name: string;
  version: 1;
  // Game themes come with Pro: see "Plans" in PLAN.md.
  kind: 'standard' | 'game';
  modes: Record<ThemeName, ThemeMode>;
  typography: {
    fonts: Record<FontRole, string>;
    sizes: Record<TextSize, { font: FontRole; fontSize: number; lineHeight: number }>;
  };
  radii: { sm: number; md: number; full: number };
  // Web addresses of a downloaded theme's pictures and sounds, by name.
  assets?: { images?: Record<string, string>; sounds?: Record<string, string> };
}

export const THEME_MODES: ThemeName[] = ['light', 'dark'];
const COLOR_KEYS: (keyof ThemeColors)[] = [
  'canvas', 'surface', 'surfaceSunken', 'border', 'text', 'textMuted', 'hollow', 'scrim',
];
const TEXT_SIZES: TextSize[] = ['small', 'body', 'title', 'display'];
const FONT_ROLES: FontRole[] = ['regular', 'medium', 'semiBold'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const HEX = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const solid = (hex: string) => hex.slice(0, 7);

export type ThemeCheck = { ok: true; theme: ThemeData } | { ok: false; errors: string[] };

// Checks the shape and that text stays readable in both modes.
export function validateTheme(input: unknown): ThemeCheck {
  const errors: string[] = [];
  const need = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
    return ok;
  };

  if (!need(isRecord(input), 'A theme must be an object')) return { ok: false, errors };
  const t = input as Record<string, unknown>;
  need(typeof t.id === 'string' && /^[a-z0-9-]{1,40}$/.test(t.id), 'id must be lowercase letters, digits and dashes');
  need(typeof t.name === 'string' && t.name.length > 0 && t.name.length <= 60, 'name must be 1 to 60 characters');
  need(t.version === 1, 'version must be 1');
  need(t.kind === 'standard' || t.kind === 'game', 'kind must be standard or game');

  const modes = isRecord(t.modes) ? t.modes : {};
  for (const mode of THEME_MODES) {
    const m = modes[mode];
    if (!isRecord(m)) {
      errors.push(`${mode} mode is missing`);
      continue;
    }
    const colors = isRecord(m.colors) ? m.colors : {};
    for (const key of COLOR_KEYS) {
      need(typeof colors[key] === 'string' && HEX.test(colors[key] as string), `${mode}.colors.${key} must be a hex colour`);
    }
    const identity = isRecord(m.identity) ? m.identity : {};
    for (const token of IDENTITY_TOKENS) {
      const i = identity[token];
      if (!isRecord(i)) {
        errors.push(`${mode}.identity.${token} is missing`);
        continue;
      }
      need(typeof i.label === 'string' && i.label.length > 0, `${mode}.identity.${token}.label is missing`);
      for (const key of ['accent', 'onAccent'] as const) {
        need(typeof i[key] === 'string' && HEX.test(i[key] as string), `${mode}.identity.${token}.${key} must be a hex colour`);
      }
    }
  }

  const typography = isRecord(t.typography) ? t.typography : {};
  const fonts = isRecord(typography.fonts) ? typography.fonts : {};
  for (const role of FONT_ROLES) need(typeof fonts[role] === 'string' && (fonts[role] as string).length > 0, `typography.fonts.${role} is missing`);
  const sizes = isRecord(typography.sizes) ? typography.sizes : {};
  for (const size of TEXT_SIZES) {
    const s = sizes[size];
    if (!isRecord(s)) {
      errors.push(`typography.sizes.${size} is missing`);
      continue;
    }
    need(FONT_ROLES.includes(s.font as FontRole), `typography.sizes.${size}.font must be one of the font roles`);
    need(typeof s.fontSize === 'number' && s.fontSize >= 10 && s.fontSize <= 72, `typography.sizes.${size}.fontSize must be 10 to 72`);
    need(typeof s.lineHeight === 'number' && s.lineHeight >= (s.fontSize as number), `typography.sizes.${size}.lineHeight must be at least the font size`);
  }

  const radii = isRecord(t.radii) ? t.radii : {};
  for (const key of ['sm', 'md', 'full']) {
    need(typeof radii[key] === 'number' && (radii[key] as number) >= 0, `radii.${key} must be a number`);
  }

  if (t.assets !== undefined) {
    const assets = isRecord(t.assets) ? t.assets : {};
    for (const group of ['images', 'sounds'] as const) {
      const entries = assets[group] === undefined ? {} : assets[group];
      if (!isRecord(entries)) {
        errors.push(`assets.${group} must be an object`);
        continue;
      }
      for (const [name, url] of Object.entries(entries)) {
        need(typeof url === 'string' && url.startsWith('https://'), `assets.${group}.${name} must be an https address`);
      }
    }
  }

  // Readable text is not optional, whatever the theme.
  if (errors.length === 0) {
    const theme = input as ThemeData;
    for (const mode of THEME_MODES) {
      const { colors, identity } = theme.modes[mode];
      for (const bg of [colors.canvas, colors.surface, colors.surfaceSunken]) {
        need(contrast(solid(colors.text), solid(bg)) >= 4.5, `${mode}: text is too faint on ${bg}`);
        need(contrast(solid(colors.textMuted), solid(bg)) >= 4.5, `${mode}: muted text is too faint on ${bg}`);
      }
      for (const token of IDENTITY_TOKENS) {
        const { accent, onAccent } = identity[token];
        need(contrast(solid(accent), solid(colors.surface)) >= 3, `${mode}: ${token} accent is too faint on the surface`);
        need(contrast(solid(onAccent), solid(accent)) >= 4.5, `${mode}: ${token} check mark is too faint on its accent`);
      }
    }
  }

  return errors.length === 0 ? { ok: true, theme: input as ThemeData } : { ok: false, errors };
}

// A theme that fails the check is never used: the default takes its place.
export function loadTheme(input: unknown, fallback: ThemeData): { theme: ThemeData; errors: string[] } {
  const check = validateTheme(input);
  return check.ok ? { theme: check.theme, errors: [] } : { theme: fallback, errors: check.errors };
}
