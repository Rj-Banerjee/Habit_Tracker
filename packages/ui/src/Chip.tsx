import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { layout, radius, space } from '@habit-tracker/core';
import { PressableState } from './desktop';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

export function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={({ hovered, focused }: PressableState) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.text : hovered ? colors.surfaceSunken : colors.surface,
          borderColor: focused ? colors.text : colors.border,
        },
      ]}
    >
      <Text variant="small" style={selected ? { color: colors.surface } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: layout.minTouchTarget,
    minWidth: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
