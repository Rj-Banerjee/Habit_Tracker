import React, { useEffect } from 'react';
import { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CHIP_FADE_MS } from './TimeChips';

interface FadeSwapProps {
  // A new value fades the contents in again, as a different chip or day is picked.
  swapKey: string;
  reducedMotion: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: React.ReactNode;
}

const RISE = 8;

export function FadeSwap({ swapKey, reducedMotion, style, onLayout, children }: FadeSwapProps) {
  const shown = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      shown.value = 1;
      return;
    }
    shown.value = 0;
    shown.value = withTiming(1, { duration: CHIP_FADE_MS, easing: Easing.out(Easing.cubic) });
  }, [swapKey, reducedMotion, shown]);
  const fade = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * RISE }],
  }));
  return (
    <Animated.View style={[style, fade]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}
