import { Linking, Platform } from 'react-native';
import type { NotificationContentInput } from 'expo-notifications';
import { isHolding, keepForLater } from './focusHold';
import {
  isHabitReminderId,
  isLogged,
  localDate,
  NUDGE_CATEGORY,
  planHabitReminders,
  REMINDER_BODY,
  REMINDER_TITLE,
  reminderId,
  weekMet,
} from '@habit-tracker/core';
import { tracker } from './tracker';

export type ReminderStatus = 'set' | 'denied' | 'blocked' | 'unavailable';

export interface ReminderResult {
  status: ReminderStatus;
  // Why it couldn't be set, in the words of whatever refused. Shown on screen.
  detail?: string;
}

const TEST_DELAY_SECONDS = 5;

// Android fixes a channel's importance when it's first made, so raising it needs a new
// id. High is what makes a reminder pop up, not just sit in the tray.
const CHANNEL = 'daily-reminder-high';

// Loaded here and not at the top of the file: this package does work when it's imported,
// and that shouldn't be able to stop the app from opening.
export function loadNotifications() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const notifications = require('expo-notifications') as typeof import('expo-notifications');
  // Without this, a reminder that fires with the app open is never shown. During
  // Tunnel Vision it's kept back instead, and shown when focus ends.
  notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const show = !isHolding();
      if (!show) {
        const { title, body, data, categoryIdentifier } = notification.request.content;
        keepForLater({ title, body, data: data ?? undefined, categoryIdentifier: categoryIdentifier ?? undefined });
      }
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
  return notifications;
}

// Shows what Tunnel Vision kept back, now that focus has ended.
export async function showHeldNotifications(held: NotificationContentInput[]) {
  if (held.length === 0) return;
  const notifications = loadNotifications();
  const channelId = await prepareChannel(notifications);
  for (const content of held) {
    await notifications
      .scheduleNotificationAsync({ content, trigger: channelId ? { channelId } : null })
      .catch(() => {});
  }
}

export type Notifications = ReturnType<typeof loadNotifications>;

// The single daily reminder from before each habit had its own. Cleared when found.
const DAILY_ID = 'daily-reminder';

const failed = (error: unknown): ReminderResult => {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn('[reminders]', detail);
  return { status: 'unavailable', detail };
};

// Android 13 won't ask for permission until a channel exists, so this comes first. It
// fails inside Expo Go, which is missing part of the module. That can't be allowed to
// stop everything after it: without a channel id, Android uses Expo's fallback channel.
export async function prepareChannel(notifications: Notifications) {
  if (Platform.OS !== 'android') return undefined;
  try {
    await notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Daily reminder',
      importance: notifications.AndroidImportance.HIGH,
    });
    return CHANNEL;
  } catch {
    return undefined;
  }
}

async function allowed(notifications: Notifications): Promise<ReminderResult | null> {
  const current = await notifications.getPermissionsAsync();
  const answer =
    current.granted || !current.canAskAgain
      ? current
      : await notifications.requestPermissionsAsync();
  if (answer.granted) return null;
  // Once refused for good, the phone won't ask again, so only its settings can change it.
  return { status: answer.canAskAgain ? 'denied' : 'blocked' };
}

// Fires in a few seconds, so nobody has to wait to find out if reminders work. Given an
// open habit, it carries the same buttons as a real nudge.
export async function sendTestReminder(habit?: {
  id: string;
  title: string;
}): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  try {
    const notifications = loadNotifications();
    const channelId = await prepareChannel(notifications);
    const refused = await allowed(notifications);
    if (refused) return refused;

    await notifications.scheduleNotificationAsync({
      content: habit
        ? {
            title: habit.title,
            body: REMINDER_BODY,
            categoryIdentifier: NUDGE_CATEGORY,
            data: { habitId: habit.id },
          }
        : { title: REMINDER_TITLE, body: REMINDER_BODY },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: TEST_DELAY_SECONDS,
        channelId,
      },
    });
    return { status: 'set' };
  } catch (error) {
    return failed(error);
  }
}

// Each habit's own reminder, planned a week ahead. Run when the app opens, after a log
// and after a habit changes, so a done habit stops reminding and a new one starts.
// Asks for permission only when told to, from a setting someone is looking at.
export async function syncHabitReminders({ ask = false }: { ask?: boolean } = {}): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  try {
    const notifications = loadNotifications();
    const channelId = await prepareChannel(notifications);
    if (ask) {
      const refused = await allowed(notifications);
      if (refused) return refused;
    } else if (!(await notifications.getPermissionsAsync()).granted) {
      return { status: 'denied' };
    }

    const [habits, rows] = await Promise.all([tracker.listReminderHabits(), tracker.getToday()]);
    const doneToday = new Set(rows.filter((row) => row.is_today && isLogged(row)).map((row) => row.habit_id));
    const metThisWeek = new Set(rows.filter((row) => row.is_today && weekMet(row)).map((row) => row.habit_id));
    const now = new Date();
    const plan = planHabitReminders({
      habits,
      doneToday,
      metThisWeek,
      today: localDate(Intl.DateTimeFormat().resolvedOptions().timeZone, now),
      nowMinutes: now.getHours() * 60 + now.getMinutes(),
    });

    const scheduled = await notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      // The old single daily reminder is replaced by these.
      if (isHabitReminderId(item.identifier) || item.identifier === DAILY_ID) {
        await notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
      }
    }
    for (const reminder of plan) {
      const [year, month, day] = reminder.date.split('-').map(Number);
      await notifications.scheduleNotificationAsync({
        identifier: reminderId(reminder),
        content: {
          title: reminder.title,
          body: REMINDER_BODY,
          categoryIdentifier: NUDGE_CATEGORY,
          data: { habitId: reminder.habitId },
        },
        trigger: {
          type: notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(year, month - 1, day, reminder.hour, reminder.minute),
          channelId,
        },
      });
    }
    return { status: 'set' };
  } catch (error) {
    return failed(error);
  }
}

export const openPhoneSettings = () => Linking.openSettings();

export function reminderMessage(result: ReminderResult): string | null {
  switch (result.status) {
    case 'denied':
      return "Notifications aren't allowed, so reminders won't arrive. Turn them on in your phone's settings.";
    case 'blocked':
      return "Notifications are turned off for this app. Turn them on in your phone's settings.";
    case 'unavailable':
      if (Platform.OS === 'web') return 'Reminders only arrive on your phone.';
      return `Reminders aren't working on this phone. ${result.detail ?? ''}`.trim();
    default:
      return null;
  }
}

// Tunnel Vision's countdown is a notification, so Android 13 and later need permission
// before it can show, on the lock screen too.
export async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await loadNotifications().getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function askForNotifications(): Promise<void> {
  try {
    const notifications = loadNotifications();
    await prepareChannel(notifications);
    const current = await notifications.getPermissionsAsync();
    if (current.granted) return;
    if (current.canAskAgain) await notifications.requestPermissionsAsync();
    else await Linking.openSettings();
  } catch {
    await Linking.openSettings().catch(() => {});
  }
}
