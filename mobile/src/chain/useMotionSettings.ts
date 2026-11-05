import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Device from 'expo-device';
import { isLowEnd, MotionSettings } from '@habit-tracker/core';

// The phone's own reduced-motion setting, and whether it's a low-end phone.
export function useMotionSettings(): MotionSettings {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => live && setReducedMotion(on))
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      live = false;
      listener.remove();
    };
  }, []);

  return { reducedMotion, lowEnd: isLowEnd(Device.totalMemory) };
}
