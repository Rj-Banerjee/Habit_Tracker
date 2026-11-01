'use client';

import React, { useSyncExternalStore } from 'react';
import { ThemeProvider, useRightClickGuard } from '@habit-tracker/ui';
import { AuthProvider } from '../hooks/useAuth';

const subscribe = () => () => {};

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
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </div>
  );
}
