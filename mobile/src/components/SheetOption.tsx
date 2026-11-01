import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radius, space } from '../theme/tokens';
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
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: pressed ? colors.surfaceSunken : 'transparent', borderColor: colors.border },
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
