import React from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { layout, radius, space, textStyles } from '@habit-tracker/core';
import { FormMessage } from './FormMessage';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

interface TextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, style, ...rest }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="small">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          textStyles.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.text : colors.border,
          },
          style,
        ]}
        {...rest}
      />
      <FormMessage message={error ?? hint} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  input: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
