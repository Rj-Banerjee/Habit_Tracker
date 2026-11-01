import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';
import { IdentityToken, layout, motion, radius, space } from '../theme/tokens';
import { HabitCardStatus, statusLabels } from './habitCardStatus';
import { StatusMark } from './StatusMark';
import { Text } from './Text';

interface HabitCardProps {
  title: string;
  status: HabitCardStatus;
  identity: IdentityToken;
  streak?: number;
  detail?: string;
  statusLabel?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onSkip?: () => void;
}

const LOGGED: HabitCardStatus[] = ['done', 'doneMinimum', 'repaired'];

export function HabitCard({
  title,
  status,
  identity,
  streak,
  detail,
  statusLabel,
  onPress,
  onLongPress,
  onSkip,
}: HabitCardProps) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const wasLogged = useRef(LOGGED.includes(status));

  useEffect(() => {
    const isLogged = LOGGED.includes(status);
    if (isLogged && !wasLogged.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
        if (reduced) return;
        scale.setValue(0.8);
        Animated.timing(scale, {
          toValue: 1,
          duration: motion.checkOffMs,
          easing: Easing.out(Easing.back(2.2)),
          useNativeDriver: motion.useNativeDriver,
        }).start();
      });
    }
    wasLogged.current = isLogged;
  }, [status, scale]);

  const label = statusLabel ?? statusLabels[status];
  // A zero is left out, so a gap never shows as a score.
  const hasStreak = streak !== undefined && streak > 0;
  const accessibilityLabel = useMemo(
    () =>
      [title, label, detail, hasStreak ? `${streak} day streak` : null]
        .filter(Boolean)
        .join(', '),
    [title, label, detail, streak, hasStreak]
  );

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityHint="Tap to log. Long press for smaller versions."
      accessibilityActions={onSkip ? [{ name: 'skip', label: 'Skip today' }] : undefined}
      onAccessibilityAction={onSkip ? () => onSkip() : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
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
            days
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: layout.minTouchTarget + space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
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
