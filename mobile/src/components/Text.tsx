import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { tabularNumerals, textStyles } from '../theme/tokens';

interface TextProps extends RNTextProps {
  variant?: keyof typeof textStyles;
  muted?: boolean;
  numeric?: boolean;
}

export function Text({ variant = 'body', muted, numeric, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        textStyles[variant],
        { color: muted ? colors.textMuted : colors.text },
        numeric && tabularNumerals,
        style,
      ]}
      {...rest}
    />
  );
}
