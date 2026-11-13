import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { space } from '@habit-tracker/core';
import { PressableState, Text, useTheme } from '@habit-tracker/ui';

interface DayHeaderProps {
  // "TODAY" or "NOV 11".
  title: string;
  // "Friday, Nov 13" or "Tuesday".
  subtitle: string;
  onAdd: () => void;
  // Lines under the subtitle, such as "2 of 5 done".
  children?: React.ReactNode;
}

const ADD = 40;

export function DayHeader({ title, subtitle, onAdd, children }: DayHeaderProps) {
  const { colors, theme } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text
          variant="title"
          accessibilityRole="header"
          style={[styles.title, { fontFamily: theme.typography.fonts.semiBold }]}
        >
          {title}
        </Text>
        <Text variant="small" muted>
          {subtitle}
        </Text>
        {children}
      </View>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add habit"
        hitSlop={space.xs}
        style={({ pressed, focused }: PressableState) => [
          styles.add,
          { backgroundColor: colors.text, opacity: pressed ? 0.8 : 1, shadowColor: colors.text },
          focused && { borderWidth: 2, borderColor: colors.textMuted },
        ]}
      >
        <Svg width={18} height={18} viewBox="0 0 18 18" accessible={false}>
          <Line x1="9" y1="3" x2="9" y2="15" stroke={colors.surface} strokeWidth={2} strokeLinecap="round" />
          <Line x1="3" y1="9" x2="15" y2="9" stroke={colors.surface} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: space.xs },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: 0.5 },
  add: {
    width: ADD,
    height: ADD,
    borderRadius: ADD / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});
