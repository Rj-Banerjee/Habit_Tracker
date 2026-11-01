import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { PressableState } from './desktop';
import { useTheme } from './ThemeProvider';
import { layout, radius, space } from '@habit-tracker/core';
import { Text } from './Text';

interface SheetOptionProps {
  label: string;
  description?: string;
  onPress: () => void;
}

export function SheetOption({ label, description, onPress }: SheetOptionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={description ? `${label}, ${description}` : label}
      style={({ pressed, hovered, focused }: PressableState) => [
        styles.option,
        {
          backgroundColor: pressed || hovered ? colors.surfaceSunken : 'transparent',
          borderColor: focused ? colors.text : colors.border,
        },
      ]}
    >
      <Text>{label}</Text>
      {description ? (
        <Text variant="small" muted>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
