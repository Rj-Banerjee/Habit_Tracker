import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

export interface Stat {
  label: string;
  value: string;
  // A short note under it, like "12 of 18 days".
  note?: string;
  // When the words for a screen reader differ, as with a trend arrow.
  spoken?: string;
}

// Numbers in tiles, two or more to a row as the width allows.
export function StatGrid({ stats }: { stats: Stat[] }) {
  const { colors, radii } = useTheme();
  return (
    <View style={styles.grid}>
      {stats.map((stat) => (
        <View
          key={stat.label}
          style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}
          accessible
          accessibilityLabel={stat.spoken ?? `${stat.label}: ${stat.value}${stat.note ? `, ${stat.note}` : ''}`}
        >
          <Text variant="title" numeric>
            {stat.value}
          </Text>
          <Text variant="small" muted>
            {stat.label}
          </Text>
          {stat.note ? (
            <Text variant="small" muted numeric>
              {stat.note}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexGrow: 1, flexBasis: '45%', minWidth: 140, padding: space.md, gap: 2, borderWidth: StyleSheet.hairlineWidth },
});
