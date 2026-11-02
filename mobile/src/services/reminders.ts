import { Platform } from 'react-native';
import {
  parseReminderTime,
  REMINDER_BODY,
  REMINDER_TITLE,
  ReminderTime,
} from '@habit-tracker/core';

export type ReminderResult = 'set' | 'denied' | 'unavailable';

const CHANNEL = 'daily-reminder';

// Loaded here and not at the top of the file: this package does work when it's imported,
// and that shouldn't be able to stop the app from opening.
function loadNotifications() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
}

async function schedule(time: ReminderTime): Promise<ReminderResult> {
  const notifications = loadNotifications();
  if (!notifications) return 'unavailable';

  // Android 13 won't ask for permission until a channel exists.
  if (Platform.OS === 'android') {
    await notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Daily reminder',
      importance: notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await notifications.getPermissionsAsync();
  const { granted } = current.granted ? current : await notifications.requestPermissionsAsync();
  if (!granted) return 'denied';

  await notifications.cancelAllScheduledNotificationsAsync();
  await notifications.scheduleNotificationAsync({
    content: { title: REMINDER_TITLE, body: REMINDER_BODY },
    trigger: {
      type: notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
      channelId: CHANNEL,
    },
  });
  return 'set';
}

// Never throws: a reminder that can't be set must not stop anyone getting into the app.
export async function setDailyReminder(time: string | null): Promise<ReminderResult> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    if (time === null) {
      await loadNotifications()?.cancelAllScheduledNotificationsAsync();
      return 'set';
    }
    const parsed = parseReminderTime(time);
    return parsed ? await schedule(parsed) : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
