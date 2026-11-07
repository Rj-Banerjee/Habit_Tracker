import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { layout, space } from '@habit-tracker/core';
import { PressableState } from './desktop';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}

// A labelled on/off setting. The whole row is the target, not just the switch.
export function ToggleRow({ label, value, onChange, hint }: ToggleRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ focused }: PressableState) => [styles.row, focused && { borderColor: colors.text }]}
    >
      <View style={styles.text}>
        <Text>{label}</Text>
        {hint ? (
          <Text variant="small" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        // The row speaks for it.
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        trackColor={{ false: colors.border, true: colors.text }}
        thumbColor={colors.surface}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  text: { flex: 1, gap: space.xs },
});
