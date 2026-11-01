import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { radius, space } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

const TRIGGER_DISTANCE = 96;

interface SwipeToSkipProps {
  enabled: boolean;
  onSkip: () => void;
  children: React.ReactNode;
}

// A left swipe opens the skip reasons. Skip is also in the long-press sheet and
// is a screen-reader action on the card, so swiping is never the only way.
export function SwipeToSkip({ enabled, onSkip, children }: SwipeToSkipProps) {
  const { colors } = useTheme();
  const offset = useRef(new Animated.Value(0)).current;
  const latest = useRef({ enabled, onSkip });
  latest.current = { enabled, onSkip };

  const responder = useMemo(() => {
    const settle = () =>
      Animated.timing(offset, {
        toValue: 0,
        duration: 160,
        useNativeDriver: Platform.OS !== 'web',
      }).start();

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        latest.current.enabled && dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderMove: (_, { dx }) => offset.setValue(Math.min(0, dx)),
      onPanResponderRelease: (_, { dx }) => {
        settle();
        if (dx <= -TRIGGER_DISTANCE) latest.current.onSkip();
      },
      onPanResponderTerminate: settle,
    });
  }, [offset]);

  return (
    <View>
      <View style={[styles.behind, { backgroundColor: colors.surfaceSunken }]}>
        <Text variant="small" muted>
          Skip
        </Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: offset }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: {
    ...StyleSheet.absoluteFill,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: space.xl,
    borderRadius: radius.md,
  },
});
