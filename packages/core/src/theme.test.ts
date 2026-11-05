import { describe, expect, it } from 'vitest';
import { loadTheme, validateTheme } from './theme';
import { DEFAULT_THEME } from './themes/default';
import { colors, identityColors, radius, textStyles } from './tokens';

const copy = () => JSON.parse(JSON.stringify(DEFAULT_THEME));

describe('themes as data', () => {
  it('passes its own check', () => {
    expect(validateTheme(DEFAULT_THEME)).toEqual({ ok: true, theme: DEFAULT_THEME });
  });

  it('survives being saved and read back as JSON, as a downloaded theme would be', () => {
    expect(validateTheme(copy()).ok).toBe(true);
  });

  it('is what the existing tokens are made from, so nothing on screen changes', () => {
    expect(colors.light).toEqual(DEFAULT_THEME.modes.light.colors);
    expect(colors.dark.text).toBe(DEFAULT_THEME.modes.dark.colors.text);
    expect(identityColors.light['identity-1'].accent).toBe('#1D5C30');
    expect(textStyles.title).toEqual({ fontFamily: 'Figtree_600SemiBold', fontSize: 21, lineHeight: 27 });
    expect(radius.md).toBe(14);
  });

  it('refuses anything that is not a theme', () => {
    expect(validateTheme(null).ok).toBe(false);
    expect(validateTheme('warm').ok).toBe(false);
  });

  it('names what is missing or wrong', () => {
    const theme = copy();
    delete theme.modes.dark;
    theme.modes.light.colors.text = 'black';
    delete theme.modes.light.identity['identity-8'];
    const check = validateTheme(theme);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.errors).toEqual(
        expect.arrayContaining([
          'dark mode is missing',
          'light.colors.text must be a hex colour',
          'light.identity.identity-8 is missing',
        ])
      );
    }
  });

  it('refuses unreadable text, whatever the theme looks like', () => {
    const theme = copy();
    theme.modes.light.colors.text = '#EFEFEF';
    const check = validateTheme(theme);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors[0]).toMatch(/^light: text is too faint/);
  });

  it('takes pictures and sounds only from https addresses', () => {
    const theme = copy();
    theme.assets = { images: { hero: 'http://example.com/a.png' }, sounds: { tick: 'https://example.com/t.mp3' } };
    const check = validateTheme(theme);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors).toEqual(['assets.images.hero must be an https address']);
  });

  it('keeps font sizes sensible', () => {
    const theme = copy();
    theme.typography.sizes.body.fontSize = 4;
    theme.typography.sizes.title.lineHeight = 10;
    const check = validateTheme(theme);
    expect(check.ok).toBe(false);
  });

  it('falls back to the default rather than show a broken theme', () => {
    const { theme, errors } = loadTheme({ id: 'broken' }, DEFAULT_THEME);
    expect(theme).toBe(DEFAULT_THEME);
    expect(errors.length).toBeGreaterThan(0);
  });
});
