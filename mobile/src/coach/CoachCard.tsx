import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { layout, radius, space } from '@habit-tracker/core';
import { PressableState, Text, useTheme } from '@habit-tracker/ui';

interface CoachCardProps {
  text: string;
  onPress: () => void;
}

export function CoachCard({ text, onPress }: CoachCardProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Coach suggestion: ${text} Ask coach`}
      onPress={onPress}
      style={({ pressed, hovered, focused }: PressableState) => [
        styles.card,
        {
          backgroundColor: colors.surfaceSunken,
          borderColor: focused ? colors.textMuted : colors.border,
          opacity: pressed || hovered ? 0.8 : 1,
        },
      ]}
    >
      <Text>{text}</Text>
      <Text variant="small" muted>
        Ask coach
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: layout.minTouchTarget,
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
