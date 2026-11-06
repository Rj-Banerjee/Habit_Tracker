import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { layout, radius, space } from '@habit-tracker/core';
import { PressableState, Text, useTheme } from '@habit-tracker/ui';

interface CoachCardProps {
  text: string;
  onPress: () => void;
  // Set on a plan without the coach: the card still helps, it just can't open a chat.
  locked?: string;
}

export function CoachCard({ text, onPress, locked }: CoachCardProps) {
  const { colors, radii } = useTheme();
  if (locked) {
    return (
      <View style={[styles.card, { borderRadius: radii.md }, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
        <Text>{text}</Text>
        <Text variant="small" muted>
          Coach · {locked}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Coach suggestion: ${text} Ask coach`}
      onPress={onPress}
      style={({ pressed, hovered, focused }: PressableState) => [
        styles.card,
        { borderRadius: radii.md },
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
