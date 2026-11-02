'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { ThemeProvider, useRightClickGuard, useTheme } from '@habit-tracker/ui';
import { AuthProvider } from '../hooks/useAuth';

const subscribe = () => () => {};

const THEME_KEY = 'theme-preference';
const themeStorage = {
  load: () => localStorage.getItem(THEME_KEY),
  save: (value: string) => localStorage.setItem(THEME_KEY, value),
};

// The stylesheet can only see the system setting, so a choice in Settings is applied
// to the page itself.
function ThemedPage() {
  const { name, colors } = useTheme();
  useEffect(() => {
    document.documentElement.style.colorScheme = name;
    document.body.style.background = colors.canvas;
    document.body.style.color = colors.text;
  }, [name, colors]);
  return null;
}

// The whole app renders in the browser. It reads the session, the colour scheme
// and the date, none of which exist in a static build, so nothing is hydrated
// that could disagree.
export function Providers({ children }: { children: React.ReactNode }) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  useRightClickGuard();

  if (!inBrowser) return null;

  return (
    <div id="app-root">
      <ThemeProvider storage={themeStorage}>
        <ThemedPage />
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </div>
  );
}
