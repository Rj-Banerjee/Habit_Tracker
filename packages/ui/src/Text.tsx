import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useTheme } from './ThemeProvider';
import { tabularNumerals, textStyles } from '@habit-tracker/core';

interface TextProps extends RNTextProps {
  variant?: keyof typeof textStyles;
  muted?: boolean;
  numeric?: boolean;
}

export function Text({ variant = 'body', muted, numeric, style, ...rest }: TextProps) {
  const { colors, text } = useTheme();
  return (
    <RNText
      style={[
        text[variant],
        { color: muted ? colors.textMuted : colors.text },
        numeric && tabularNumerals,
        style,
      ]}
      {...rest}
    />
  );
}
