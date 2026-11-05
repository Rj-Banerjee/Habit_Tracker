import { Linking, Platform } from 'react-native';
import type { NotificationContentInput } from 'expo-notifications';
import { isHolding, keepForLater } from './focusHold';
import {
  NUDGE_CATEGORY,
  parseReminderTime,
  REMINDER_BODY,
  REMINDER_TITLE,
  ReminderTime,
} from '@habit-tracker/core';

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

// Named, so the daily reminder and a nudge can each be replaced without touching the other.
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

async function scheduleDaily(
  notifications: Notifications,
  time: ReminderTime,
  channelId: string | undefined
) {
  await notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {});
  await notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: { title: REMINDER_TITLE, body: REMINDER_BODY },
    trigger: {
      type: notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
      channelId,
    },
  });
}

const isScheduled = (scheduled: { identifier: string }[]) =>
  scheduled.some((item) => item.identifier === DAILY_ID);

// Never throws: a reminder that can't be set must not stop anyone getting into the app.
export async function setDailyReminder(time: string | null): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  try {
    const notifications = loadNotifications();
    if (time === null) {
      await notifications.cancelScheduledNotificationAsync(DAILY_ID);
      return { status: 'set' };
    }
    const parsed = parseReminderTime(time);
    if (!parsed) return { status: 'unavailable', detail: `Not a time: ${time}` };

    const channelId = await prepareChannel(notifications);
    const refused = await allowed(notifications);
    if (refused) return refused;

    await scheduleDaily(notifications, parsed, channelId);
    const scheduled = await notifications.getAllScheduledNotificationsAsync();
    return isScheduled(scheduled)
      ? { status: 'set' }
      : { status: 'unavailable', detail: 'The phone accepted the reminder but has none scheduled.' };
  } catch (error) {
    return failed(error);
  }
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

// On opening the app: restores the handler after a restart, and the reminder on a new
// phone. Never asks for permission, because nobody is looking at a reminder setting.
export async function restoreDailyReminder(time: string | null) {
  if (Platform.OS === 'web' || !time) return;
  try {
    const notifications = loadNotifications();
    const parsed = parseReminderTime(time);
    const { granted } = await notifications.getPermissionsAsync();
    if (!parsed || !granted) return;
    const scheduled = await notifications.getAllScheduledNotificationsAsync();
    if (!isScheduled(scheduled)) {
      await scheduleDaily(notifications, parsed, await prepareChannel(notifications));
    }
  } catch (error) {
    failed(error);
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
