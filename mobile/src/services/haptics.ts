import * as Haptics from 'expo-haptics';

export function checkOffTick() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
