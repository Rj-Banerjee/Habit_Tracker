import * as Haptics from 'expo-haptics';

export function checkOffTick() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// A crack: one light tap, never a warning.
export function crackTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// The moment a weld's two segments meet.
export function weldSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
