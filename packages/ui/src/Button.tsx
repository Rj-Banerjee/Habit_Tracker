import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { PressableState } from './desktop';
import { useTheme } from './ThemeProvider';
import { layout, radius, space } from '@habit-tracker/core';
import { Text } from './Text';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  quiet?: boolean;
  accessibilityLabel?: string;
}

export function Button({ label, onPress, disabled, quiet, accessibilityLabel }: ButtonProps) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed, hovered, focused }: PressableState) => [
        styles.button,
        { borderRadius: radii.md },
        {
          backgroundColor: quiet ? 'transparent' : colors.text,
          borderColor: focused ? colors.textMuted : colors.border,
          opacity: disabled ? 0.5 : pressed || hovered ? 0.8 : 1,
        },
      ]}
    >
      <Text style={{ color: quiet ? colors.text : colors.surface }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
