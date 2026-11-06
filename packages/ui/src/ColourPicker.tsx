import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IDENTITY_TOKENS, IdentityToken, layout, radius, space } from '@habit-tracker/core';
import { PressableState } from './desktop';
import { StatusMark } from './StatusMark';
import { useTheme } from './ThemeProvider';

interface ColourPickerProps {
  value: IdentityToken;
  onChange: (token: IdentityToken) => void;
}

// Each identity owns one accent colour. The name is read out, so colour is never
// the only way to tell them apart.
export function ColourPicker({ value, onChange }: ColourPickerProps) {
  const { colors, identity, radii } = useTheme();
  return (
    <View style={styles.row}>
      {IDENTITY_TOKENS.map((token) => (
        <Pressable
          key={token}
          onPress={() => onChange(token)}
          accessibilityRole="button"
          accessibilityLabel={identity(token).label}
          accessibilityState={{ selected: token === value }}
          style={({ focused }: PressableState) => [
            styles.swatch,
            { borderRadius: radii.sm },
            { borderColor: token === value || focused ? colors.text : 'transparent' },
          ]}
        >
          <StatusMark status={token === value ? 'done' : 'due'} identity={token} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  swatch: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 2,
  },
});
