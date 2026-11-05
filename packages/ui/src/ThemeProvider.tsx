import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  DEFAULT_THEME,
  identityColors,
  IdentityToken,
  textStylesFor,
  ThemeColors,
  ThemeData,
  ThemeName,
  withGlow,
} from '@habit-tracker/core';

export type ThemePreference = 'system' | ThemeName;

export const THEME_PREFERENCES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Each app brings its own: AsyncStorage on mobile, localStorage on the web.
export interface ThemeStorage {
  load: () => Promise<string | null> | string | null;
  save: (value: ThemePreference) => unknown;
}

const isPreference = (value: unknown): value is ThemePreference =>
  THEME_PREFERENCES.some((preference) => preference.value === value);

interface ThemeContextValue {
  name: ThemeName;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  colors: ThemeColors;
  identity: (token: IdentityToken) => (typeof identityColors)['light'][IdentityToken];
  // The theme as data, and its text styles and corner radii, for components to read.
  theme: ThemeData;
  text: ReturnType<typeof textStylesFor>;
  radii: ThemeData['radii'];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
  forced,
  storage,
  theme = DEFAULT_THEME,
}: {
  children: React.ReactNode;
  forced?: ThemeName;
  storage?: ThemeStorage;
  // Checked with validateTheme before it gets here. The default is today's look.
  theme?: ThemeData;
}) {
  const system = useColorScheme();
  const [preference, setChoice] = useState<ThemePreference>('system');
  const chosen = preference === 'system' ? system : preference;
  const name: ThemeName = forced ?? (chosen === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    let current = true;
    // A blocked or failed read just means the default.
    Promise.resolve()
      .then(() => storage?.load())
      .then((saved) => {
        if (current && isPreference(saved)) setChoice(saved);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [storage]);

  const accents = useMemo(
    () => ({ light: withGlow(theme.modes.light.identity), dark: withGlow(theme.modes.dark.identity) }),
    [theme]
  );
  const text = useMemo(() => textStylesFor(theme.typography), [theme]);

  const value = useMemo(
    () => ({
      name,
      preference,
      setPreference: (next: ThemePreference) => {
        setChoice(next);
        Promise.resolve()
          .then(() => storage?.save(next))
          .catch(() => {});
      },
      colors: theme.modes[name].colors,
      identity: (token: IdentityToken) => accents[name][token],
      theme,
      text,
      radii: theme.radii,
    }),
    [name, preference, storage, theme, accents, text]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return value;
}
