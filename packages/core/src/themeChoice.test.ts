import { describe, expect, it } from 'vitest';
import { contrast, hueAndSaturation } from './colorChecks';
import { validateTheme } from './theme';
import { ACCENT_IDS, ACCENT_SWATCHES, buildTheme, DEFAULT_THEME_CHOICE, parseThemeChoice } from './themeChoice';
import { DEFAULT_THEME } from './themes/default';
import { FONT_FAMILIES, FONT_FAMILY_IDS } from './themes/fonts';
import { STANDARD_THEMES } from './themes/standard';
import { withGlow } from './tokens';

describe('the standard themes', () => {
  it('number at least ten, as Free promises, with the default first', () => {
    expect(STANDARD_THEMES.length).toBeGreaterThanOrEqual(10);
    expect(STANDARD_THEMES[0]).toBe(DEFAULT_THEME);
  });

  it('have their own ids and names, and all pass the check', () => {
    expect(new Set(STANDARD_THEMES.map((t) => t.id)).size).toBe(STANDARD_THEMES.length);
    expect(new Set(STANDARD_THEMES.map((t) => t.name)).size).toBe(STANDARD_THEMES.length);
    for (const t of STANDARD_THEMES) {
      expect({ id: t.id, ok: validateTheme(t).ok }).toEqual({ id: t.id, ok: true });
      expect(t.kind).toBe('standard');
    }
  });

  it('use only bundled typefaces', () => {
    const bundled = new Set(FONT_FAMILY_IDS.flatMap((id) => Object.values(FONT_FAMILIES[id].fonts)));
    for (const t of STANDARD_THEMES) for (const f of Object.values(t.typography.fonts)) expect(bundled).toContain(f);
  });
});

describe('accent swatches', () => {
  const cases = STANDARD_THEMES.flatMap((t) => (['light', 'dark'] as const).map((mode) => [t.name, mode, t] as const));

  it.each(cases)('read well on %s %s', (_name, mode, theme) => {
    const { surface, canvas } = theme.modes[mode].colors;
    const onAccent = theme.modes[mode].identity['identity-1'].onAccent;
    for (const id of ACCENT_IDS) {
      const accent = ACCENT_SWATCHES[id][mode];
      expect({ id, surface: contrast(accent, surface) >= 4.5 }).toEqual({ id, surface: true });
      expect({ id, canvas: contrast(accent, canvas) >= 3 }).toEqual({ id, canvas: true });
      expect({ id, check: contrast(onAccent, accent) >= 4.5 }).toEqual({ id, check: true });
    }
  });

  it('are never red, and neither are their weld glows', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const id of ACCENT_IDS) {
        const accent = ACCENT_SWATCHES[id][mode];
        const glow = withGlow({ 'identity-1': { label: id, accent, onAccent: '#1D1A16' } } as never)['identity-1'].glow;
        for (const hex of [accent, glow]) {
          const { hue, saturation } = hueAndSaturation(hex);
          expect({ id, hex, red: (hue < 18 || hue > 340) && saturation > 0.3 }).toEqual({ id, hex, red: false });
        }
      }
    }
  });

  it('include the eight default accents unchanged', () => {
    for (const mode of ['light', 'dark'] as const) {
      const defaults = Object.values(DEFAULT_THEME.modes[mode].identity).map((i) => i.accent);
      const swatches = ACCENT_IDS.map((id) => ACCENT_SWATCHES[id][mode]);
      for (const accent of defaults) expect(swatches).toContain(accent);
    }
  });
});

describe('buildTheme', () => {
  it('gives the default for the default choice', () => {
    expect(buildTheme(DEFAULT_THEME_CHOICE)).toEqual(DEFAULT_THEME);
  });

  it('applies a theme, another typeface and an identity colour, in both modes', () => {
    const theme = buildTheme({ themeId: 'sage', font: 'lora', accents: { 'identity-2': 'indigo' } });
    expect(theme.id).toBe('sage');
    expect(theme.typography.fonts.regular).toBe('Lora_400Regular');
    expect(theme.modes.light.identity['identity-2']).toMatchObject({ label: 'Indigo', accent: '#3939CD' });
    expect(theme.modes.dark.identity['identity-2']).toMatchObject({ label: 'Indigo', accent: '#8D8DE4' });
    expect(theme.modes.light.identity['identity-1'].accent).toBe('#1D5C30');
    expect(validateTheme(theme).ok).toBe(true);
  });

  it('falls back to the default theme for one it does not know', () => {
    expect(buildTheme({ themeId: 'gone' }).id).toBe(DEFAULT_THEME.id);
  });
});

describe('parseThemeChoice', () => {
  it('reads back what was saved', () => {
    const choice = { themeId: 'dusk', font: 'atkinson', accents: { 'identity-3': 'olive' } };
    expect(parseThemeChoice(JSON.stringify(choice))).toEqual(choice);
  });

  it('drops what no longer exists, and survives junk', () => {
    expect(parseThemeChoice('{"themeId":"gone","font":"comic","accents":{"identity-1":"red","x":"pine"}}')).toEqual(
      DEFAULT_THEME_CHOICE
    );
    expect(parseThemeChoice('not json')).toEqual(DEFAULT_THEME_CHOICE);
    expect(parseThemeChoice(null)).toEqual(DEFAULT_THEME_CHOICE);
  });
});
