import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  addDays,
  isLogged,
  localDate,
  NudgePlan,
  planNudge,
  REMINDER_TITLE,
  TodayRow,
} from '@habit-tracker/core';
import { ai } from './ai';
import { loadNotifications, prepareChannel } from './reminders';
import { tracker } from './tracker';

const NUDGE_ID = 'nudge';
const PENDING_KEY = 'pending-nudge';
const OFF_KEY = 'nudges-off';
const HISTORY_DAYS = 60;

export const nudgesEnabled = async () => (await AsyncStorage.getItem(OFF_KEY)) === null;

export async function setNudgesEnabled(enabled: boolean) {
  if (enabled) await AsyncStorage.removeItem(OFF_KEY);
  else {
    await AsyncStorage.setItem(OFF_KEY, '1');
    await cancelNudge();
  }
}

async function readPending(): Promise<NudgePlan | null> {
  const saved = await AsyncStorage.getItem(PENDING_KEY);
  return saved ? (JSON.parse(saved) as NudgePlan) : null;
}

export async function cancelNudge() {
  await AsyncStorage.removeItem(PENDING_KEY);
  await loadNotifications()
    .cancelScheduledNotificationAsync(NUDGE_ID)
    .catch(() => {});
}

const firesAt = (plan: NudgePlan) => {
  const [year, month, day] = plan.date.split('-').map(Number);
  return new Date(year, month - 1, day, plan.hour, plan.minute);
};

// Logged before it fired, so it isn't needed. This is cheap, so it runs on every change.
export async function cancelIfLogged(rows: TodayRow[]) {
  if (Platform.OS === 'web') return;
  try {
    const pending = await readPending();
    if (!pending || firesAt(pending) < new Date()) return;
    const row = rows.find((item) => item.habit_id === pending.habitId && item.is_today);
    if (pending.date === row?.day && isLogged(row)) await cancelNudge();
  } catch {
    // A nudge that stays scheduled is a small thing. Nothing here may disturb Today.
  }
}

// Once a nudge's day is over, records whether it helped.
async function recordOutcome(pending: NudgePlan) {
  const days = await tracker.getHabitDays(pending.date, pending.date);
  const day = days.find((item) => item.habit_id === pending.habitId);
  const done = day?.status === 'done' || day?.status === 'repaired';
  await ai.nudgeOutcome(pending.habitId, pending.date, done ? 'logged' : 'ignored');
  await AsyncStorage.removeItem(PENDING_KEY);
}

// On opening the app. Never asks for permission, and never throws.
export async function syncNudge(rows: TodayRow[]) {
  if (Platform.OS === 'web') return;
  try {
    if (!(await nudgesEnabled())) return;
    const profile = await tracker.getProfile();
    const today = localDate(profile.timezone);

    const pending = await readPending();
    if (pending && pending.date < today) await recordOutcome(pending);
    else if (pending) return;

    const notifications = loadNotifications();
    if (!(await notifications.getPermissionsAsync()).granted) return;

    const [habits, days, history] = await Promise.all([
      tracker.listProgressHabits(),
      tracker.getHabitDays(addDays(today, -HISTORY_DAYS), today),
      tracker.listNudgeHistory(),
    ]);
    const now = new Date();
    const plan = planNudge({
      habits,
      days,
      rows,
      today,
      nowMinutes: now.getHours() * 60 + now.getMinutes(),
      reminder: profile.reminder_time?.slice(0, 5) ?? null,
      history,
    });
    if (!plan) return;

    const channelId = await prepareChannel(notifications);
    await notifications.scheduleNotificationAsync({
      identifier: NUDGE_ID,
      content: { title: REMINDER_TITLE, body: plan.body },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date: firesAt(plan),
        channelId,
      },
    });
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(plan));
  } catch (error) {
    console.warn('[nudges]', error instanceof Error ? error.message : error);
  }
}
