import { requireOptionalNativeModule } from 'expo';

export interface FocusSession {
  habitId: string;
  title: string;
  minutes: number;
  endAt: number;
  paused: boolean;
  remainingMs: number;
  timeUp: boolean;
  // Stop or Done tapped in the notification, waiting for the app to act on it.
  pending?: 'stop' | 'done' | null;
}

export interface FocusLockModule {
  // Screen pinning: the app stays open, and Android turns off Home and Recents.
  pin(): boolean;
  unpin(): void;
  isPinned(): boolean;
  openPinningSettings(): void;
  // The countdown in the notification and on the lock screen.
  start(habitId: string, title: string, detail: string, minutes: number, endAt: number): void;
  pause(remainingMs: number): void;
  resume(endAt: number): void;
  stop(): void;
  status(): FocusSession | null;
  clearPending(): void;
  // Whether the phone is on its lock screen, to notice a phone that locks on unpinning.
  isLocked(): boolean;
}

// Android only, and missing from Expo Go: null there, and Tunnel Vision runs in the app alone.
export const FocusLock = requireOptionalNativeModule<FocusLockModule>('FocusLock');
