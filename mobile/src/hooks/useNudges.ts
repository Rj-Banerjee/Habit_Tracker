import { useEffect, useRef } from 'react';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { TodayRow } from '@habit-tracker/core';
import { handleNotificationResponse } from '../services/notificationActions';
import { cancelIfLogged, syncNudge } from '../services/nudges';

export function useNudges(rows: TodayRow[], loading: boolean, refresh: () => Promise<unknown>) {
  const planned = useRef(false);

  // While the app is open, a notification's buttons land here, not in the background task.
  useEffect(() => {
    if (Platform.OS === 'web' || isRunningInExpoGo()) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifications = require('expo-notifications') as typeof import('expo-notifications');
    const listener = notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response)
        .then(refresh)
        .catch((error) =>
          console.warn('[notification action]', error instanceof Error ? error.message : error)
        );
    });
    return () => listener.remove();
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    if (!planned.current) {
      planned.current = true;
      void syncNudge(rows);
    }
    void cancelIfLogged(rows);
  }, [rows, loading]);
}
