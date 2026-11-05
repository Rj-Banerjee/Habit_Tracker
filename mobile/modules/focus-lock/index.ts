import { requireOptionalNativeModule } from 'expo';

export interface FocusSession {
  habitId: string;
  title: string;
  minutes: number;
  endAt: number;
  paused: boolean;
  remainingMs: number;
  timeUp: boolean;
}

export interface FocusLockModule {
  hasUsageAccess(): boolean;
  canDrawOverlays(): boolean;
  openUsageAccessSettings(): void;
  openOverlaySettings(): void;
  start(habitId: string, title: string, minutes: number, endAt: number): void;
  pause(remainingMs: number): void;
  resume(endAt: number): void;
  stop(): void;
  status(): FocusSession | null;
}

// Android only, and missing from Expo Go: null there, and Tunnel Vision runs in the app alone.
export const FocusLock = requireOptionalNativeModule<FocusLockModule>('FocusLock');
