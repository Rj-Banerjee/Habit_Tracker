import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { colors, identityColors, IdentityToken, ThemeColors, ThemeName } from './tokens';

interface ThemeContextValue {
  name: ThemeName;
  colors: ThemeColors;
  identity: (token: IdentityToken) => (typeof identityColors)['light'][IdentityToken];
  setOverride: (name: ThemeName | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
  forced,
}: {
  children: React.ReactNode;
  forced?: ThemeName;
}) {
  const system = useColorScheme();
  const [override, setOverride] = useState<ThemeName | null>(null);
  const name: ThemeName = forced ?? override ?? (system === 'dark' ? 'dark' : 'light');

  const value = useMemo(
    () => ({
      name,
      colors: colors[name],
      identity: (token: IdentityToken) => identityColors[name][token],
      setOverride,
    }),
    [name]
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
