import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import {
  isNotificationAction,
  NOTIFICATION_ACTIONS,
  NOTIFICATION_TASK,
  NotificationContentData,
  notificationHabitId,
  NUDGE_CATEGORY,
  runNotificationAction,
} from '@habit-tracker/core';
import { offlineTracker } from './logQueue';
import { refreshWidget } from './widget';

interface ActionResponse {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: NotificationContentData } };
}

// With the app alive but in the background, the task and the listener both get the same
// tap. Notification ids repeat from day to day, so a repeat only counts for a short while.
const REPEAT_MS = 60_000;
const recentTaps = new Map<string, number>();

function isRepeatTap(key: string) {
  const now = Date.now();
  const repeat = now - (recentTaps.get(key) ?? 0) < REPEAT_MS;
  recentTaps.set(key, now);
  return repeat;
}

// Shared by the background task and the listener used while the app is open.
export async function handleNotificationResponse(response: ActionResponse) {
  const { actionIdentifier } = response;
  if (!isNotificationAction(actionIdentifier)) return;
  const { identifier, content } = response.notification.request;
  const habitId = notificationHabitId(content);
  if (!habitId) {
    console.warn('[notification action]', `${actionIdentifier} tapped with no habit`);
    return;
  }
  if (isRepeatTap(`${identifier}:${actionIdentifier}:${habitId}`)) return;
  await runNotificationAction(offlineTracker, actionIdentifier, habitId);
  await refreshWidget();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const notifications = require('expo-notifications') as typeof import('expo-notifications');
  await notifications.dismissNotificationAsync(identifier).catch(() => {});
}

// Must run at startup, before anything else, so the background task exists when it's
// needed. Native code that isn't in Expo Go, so it's loaded only where it exists.
export function registerNotificationActions() {
  if (Platform.OS === 'web' || isRunningInExpoGo()) return;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
  const notifications = require('expo-notifications') as typeof import('expo-notifications');
  /* eslint-enable @typescript-eslint/no-require-imports */

  TaskManager.defineTask(NOTIFICATION_TASK, async ({ data }) => {
    if (data && typeof data === 'object' && 'actionIdentifier' in data) {
      await handleNotificationResponse(data as ActionResponse).catch((error) =>
        console.warn('[notification action]', error instanceof Error ? error.message : error)
      );
    }
  });

  notifications.registerTaskAsync(NOTIFICATION_TASK).catch(() => {});
  notifications
    .setNotificationCategoryAsync(
      NUDGE_CATEGORY,
      NOTIFICATION_ACTIONS.map(({ id, title }) => ({
        identifier: id,
        buttonTitle: title,
        options: { opensAppToForeground: false },
      }))
    )
    .catch(() => {});
}
