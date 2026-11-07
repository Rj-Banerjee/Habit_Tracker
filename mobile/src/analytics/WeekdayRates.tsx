import React from 'react';
import { StyleSheet, View } from 'react-native';
import { percentLabel, space, Timing } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface WeekdayRatesProps {
  byWeekday: Timing['byWeekday'];
  accent: string;
}

// Completion by weekday, as bars with their numbers written beside them.
export function WeekdayRates({ byWeekday, accent }: WeekdayRatesProps) {
  const { colors, radii } = useTheme();
  if (byWeekday.every((slot) => slot.judged === 0)) {
    return (
      <Text variant="small" muted>
        Once a few weeks are logged, each weekday shows how often it gets done.
      </Text>
    );
  }
  return (
    <View style={styles.root}>
      {byWeekday.map((slot, i) => (
        <View
          key={DAYS[i]}
          style={styles.row}
          accessible
          accessibilityLabel={`${LONG_DAYS[i]}: ${slot.judged ? `${percentLabel(slot.rate)}, ${slot.done} of ${slot.judged}` : 'not due'}`}
        >
          <Text variant="small" muted style={styles.day}>
            {DAYS[i]}
          </Text>
          <View style={[styles.track, { backgroundColor: colors.surfaceSunken, borderRadius: radii.sm }]}>
            {slot.rate ? (
              <View style={[styles.fill, { width: `${slot.rate * 100}%`, backgroundColor: accent, borderRadius: radii.sm }]} />
            ) : null}
          </View>
          <Text variant="small" numeric style={styles.value}>
            {slot.judged ? `${percentLabel(slot.rate)} · ${slot.done}/${slot.judged}` : '–'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  day: { width: 32 },
  track: { flex: 1, height: 8, overflow: 'hidden' },
  fill: { height: 8 },
  value: { width: 84, textAlign: 'right' },
});
