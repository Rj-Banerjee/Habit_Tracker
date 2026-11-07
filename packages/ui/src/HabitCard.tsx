import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  HabitCardStatus,
  IdentityToken,
  layout,
  motion,
  radius,
  space,
  statusLabels,
} from '@habit-tracker/core';
import { PressableState, rightClick } from './desktop';
import { useTheme } from './ThemeProvider';
import { StatusMark } from './StatusMark';
import { Text } from './Text';

interface HabitCardProps {
  title: string;
  status: HabitCardStatus;
  identity: IdentityToken;
  streak?: number;
  // A times-per-week habit counts its streak in weeks.
  streakUnit?: 'day' | 'week';
  detail?: string;
  statusLabel?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onSkip?: () => void;
  // Fires when a habit becomes logged. Apps use this for a haptic tick.
  onCheckOff?: () => void;
  // Drawn under the title, full width: the streak chain on Today.
  footer?: React.ReactNode;
  // Tunnel Vision, offered to screen readers as an action on the card.
  onFocusMode?: () => void;
}

const LOGGED: HabitCardStatus[] = ['done', 'doneMinimum', 'repaired'];

export function HabitCard({
  title,
  status,
  identity,
  streak,
  streakUnit = 'day',
  detail,
  statusLabel,
  onPress,
  onLongPress,
  onSkip,
  onCheckOff,
  footer,
  onFocusMode,
}: HabitCardProps) {
  const { colors, radii } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const wasLogged = useRef(LOGGED.includes(status));

  useEffect(() => {
    const isLogged = LOGGED.includes(status);
    if (isLogged && !wasLogged.current) {
      onCheckOff?.();
      AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
        if (reduced) return;
        scale.setValue(0.8);
        Animated.timing(scale, {
          toValue: 1,
          duration: motion.checkOffMs,
          easing: Easing.out(Easing.back(2.2)),
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      });
    }
    wasLogged.current = isLogged;
  }, [status, scale, onCheckOff]);

  const label = statusLabel ?? statusLabels[status];
  // A zero is left out, so a gap never shows as a score.
  const hasStreak = streak !== undefined && streak > 0;
  const accessibilityLabel = useMemo(
    () =>
      [title, label, detail, hasStreak ? `${streak} ${streakUnit} streak` : null]
        .filter(Boolean)
        .join(', '),
    [title, label, detail, streak, hasStreak, streakUnit]
  );

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityHint="Tap to log. Long press for smaller versions."
      accessibilityActions={[
        ...(onSkip ? [{ name: 'skip', label: 'Skip today' }] : []),
        ...(onFocusMode ? [{ name: 'focus', label: 'Focus' }] : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'skip') onSkip?.();
        if (event.nativeEvent.actionName === 'focus') onFocusMode?.();
      }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed, hovered, focused }: PressableState) => [
        styles.card,
        { borderRadius: radii.md },
        {
          backgroundColor: pressed || hovered ? colors.surfaceSunken : colors.surface,
          borderColor: focused ? colors.text : colors.border,
        },
      ]}
      {...rightClick(onLongPress)}
    >
      <View style={styles.row}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <StatusMark status={status} identity={identity} />
        </Animated.View>

        <View style={styles.body}>
          <Text numberOfLines={1}>{title}</Text>
          <Text variant="small" muted numberOfLines={1}>
            {detail ? `${label} · ${detail}` : label}
          </Text>
        </View>

        {hasStreak && (
          <View style={styles.streak}>
            <Text variant="title" numeric>
              {streak}
            </Text>
            <Text variant="small" muted>
              {streakUnit === 'week' ? 'weeks' : 'days'}
            </Text>
          </View>
        )}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: layout.minTouchTarget + space.lg,
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  footer: {
    // Lines up with the title, past the status mark.
    paddingLeft: 28 + space.md,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  streak: {
    alignItems: 'flex-end',
    minWidth: 44,
  },
});
