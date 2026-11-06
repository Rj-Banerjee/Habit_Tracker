import { describe, expect, it } from 'vitest';
import { layout, motion, textStyles, ThemeName, withGlow } from './tokens';
import { contrast, CVD_TYPES, deltaE, hexToRgb, hueAndSaturation, simulateCvd } from './colorChecks';
import { STANDARD_THEMES } from './themes/standard';

const modes: ThemeName[] = ['light', 'dark'];

// Every bundled theme is held to the default's rules, in both modes.
const cases = STANDARD_THEMES.flatMap((t) => modes.map((mode) => [`${t.name} ${mode}`, t, mode] as const));

describe.each(cases)('%s', (_label, data, theme) => {
  const c = data.modes[theme].colors;
  const palette = withGlow(data.modes[theme].identity);
  const identityColors = { [theme]: palette } as Record<ThemeName, typeof palette>;
  const accents = Object.values(palette);

  it('has no pure white or black', () => {
    const all = [...Object.values(c), ...accents.flatMap((a) => [a.accent, a.onAccent])];
    expect(all.map((v) => v.toUpperCase())).not.toContain('#FFFFFF');
    expect(all.map((v) => v.toUpperCase())).not.toContain('#000000');
  });

  it('has readable text on every surface', () => {
    for (const bg of [c.canvas, c.surface, c.surfaceSunken]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('has a hollow dot that is visible but quiet', () => {
    expect(contrast(c.hollow, c.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.hollow, c.surface)).toBeLessThan(contrast(c.text, c.surface));
  });

  it.each(Object.keys(identityColors[theme]))('%s has a weld glow brighter than its accent, in the same hue', (token) => {
    const a = identityColors[theme][token as keyof (typeof identityColors)['light']];
    const luminance = (hex: string) => contrast(hex, '#000001');
    expect(luminance(a.glow)).toBeGreaterThan(luminance(a.accent));
    expect(a.glow.toUpperCase()).not.toBe('#FFFFFF');
    const { hue: glowHue, saturation } = hueAndSaturation(a.glow);
    const { hue, saturation: accentSaturation } = hueAndSaturation(a.accent);
    const apart = Math.min(Math.abs(glowHue - hue), 360 - Math.abs(glowHue - hue));
    // Greys have no real hue to keep.
    if (accentSaturation > 0.2) expect(apart).toBeLessThan(30);
    const isRed = (glowHue < 18 || glowHue > 340) && saturation > 0.3;
    expect({ glow: a.glow, isRed }).toEqual({ glow: a.glow, isRed: false });
  });

  it('has exactly 8 identity accents', () => {
    expect(accents).toHaveLength(8);
  });

  it.each(Object.keys(identityColors[theme]))('%s meets contrast rules', (token) => {
    const a = identityColors[theme][token as keyof (typeof identityColors)['light']];
    expect(contrast(a.accent, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(a.accent, c.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(a.onAccent, a.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses no red', () => {
    const palette = [...accents.map((a) => a.accent), c.hollow, c.textMuted];
    for (const hex of palette) {
      const { hue, saturation } = hueAndSaturation(hex);
      const isRed = (hue < 18 || hue > 340) && saturation > 0.3;
      expect({ hex, isRed }).toEqual({ hex, isRed: false });
    }
  });

  it('keeps every accent pair apart with normal vision', () => {
    const rgb = accents.map((a) => hexToRgb(a.accent));
    for (let i = 0; i < rgb.length; i += 1) {
      for (let j = i + 1; j < rgb.length; j += 1) {
        expect(deltaE(rgb[i], rgb[j])).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it.each(CVD_TYPES)('keeps every accent pair apart under %s', (type) => {
    const rgb = accents.map((a) => simulateCvd(hexToRgb(a.accent), type));
    for (let i = 0; i < rgb.length; i += 1) {
      for (let j = i + 1; j < rgb.length; j += 1) {
        const pair = `${accents[i].label}/${accents[j].label}`;
        expect({ pair, enough: deltaE(rgb[i], rgb[j]) >= 12 }).toEqual({ pair, enough: true });
      }
    }
  });
});

describe('shared tokens', () => {
  it('has three text sizes plus display', () => {
    expect(Object.keys(textStyles)).toEqual(['small', 'body', 'title', 'display']);
  });

  it('has a 48px minimum touch target', () => {
    expect(layout.minTouchTarget).toBeGreaterThanOrEqual(48);
  });

  it('keeps the check-off under 400ms', () => {
    expect(motion.checkOffMs).toBeLessThan(400);
  });
});
