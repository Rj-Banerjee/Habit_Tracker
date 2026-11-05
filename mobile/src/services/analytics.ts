import { analyticsOn, createAnalytics, postHogSink } from '@habit-tracker/core';

const INSTALL_KEY = 'analytics-install';

// Off unless EXPO_PUBLIC_ANALYTICS=on and a PostHog project key are both set, which is
// planned for the closed beta.
const enabled = analyticsOn(process.env.EXPO_PUBLIC_ANALYTICS);
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
const key = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';

// A random id for this install, never the account, plus the day it was first opened.
let install: { id: string; firstOpen: string } | null = null;

export const analytics = createAnalytics({
  enabled,
  sink: enabled && key ? postHogSink(host, key, (url, init) => fetch(url, init)) : null,
  installId: () => install?.id ?? null,
});

const randomId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// Records an open, for retention. Does nothing at all while analytics is off.
export async function trackAppOpened(now = new Date()) {
  if (!analytics.enabled) return;
  try {
    // Loaded only when analytics is on, so while it's off nothing is stored.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('@react-native-async-storage/async-storage');
    const AsyncStorage = storage.default ?? storage;
    if (!install) {
      const saved = await AsyncStorage.getItem(INSTALL_KEY);
      install = saved ? JSON.parse(saved) : { id: randomId(), firstOpen: now.toISOString().slice(0, 10) };
      if (!saved) await AsyncStorage.setItem(INSTALL_KEY, JSON.stringify(install));
    }
    const days = Math.floor((now.getTime() - Date.parse(install!.firstOpen)) / 86_400_000);
    analytics.track('app_opened', { days_since_first_open: days });
  } catch {
    // Analytics is never worth an error on screen.
  }
}
