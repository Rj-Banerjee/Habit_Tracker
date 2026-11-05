import type { NotificationContentInput } from 'expo-notifications';

// While Tunnel Vision is on, the app's own notifications wait until it ends.
let holding = false;
let held: NotificationContentInput[] = [];

export const isHolding = () => holding;

export function holdNotifications() {
  holding = true;
  held = [];
}

// Called by the notification handler for each one that arrives while focusing.
export function keepForLater(content: NotificationContentInput) {
  held.push(content);
}

// Ends the hold and hands back what was kept, oldest first, so it can be shown now.
export function releaseNotifications(): NotificationContentInput[] {
  holding = false;
  const out = held;
  held = [];
  return out;
}
