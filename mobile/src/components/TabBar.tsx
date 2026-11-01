import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout } from '@habit-tracker/core';
import { PressableState, Text, useTheme } from '@habit-tracker/ui';

export type Tab = 'today' | 'you';

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'you', label: 'You' },
];

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { paddingBottom: bottom, backgroundColor: colors.surface, borderTopColor: colors.border },
      ]}
    >
      {TABS.map(({ key, label }) => {
        const selected = key === active;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => onChange(key)}
            style={({ focused }: PressableState) => [
              styles.tab,
              focused && { backgroundColor: colors.surfaceSunken },
            ]}
          >
            <Text variant="small" muted={!selected}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: layout.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
