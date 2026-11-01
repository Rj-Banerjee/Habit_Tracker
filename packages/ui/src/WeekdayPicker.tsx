import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ALL_DAYS, space, toggleDay, WEEKDAY_LABELS } from '@habit-tracker/core';
import { Chip } from './Chip';

interface WeekdayPickerProps {
  days: number[];
  onChange: (days: number[]) => void;
}

export function WeekdayPicker({ days, onChange }: WeekdayPickerProps) {
  return (
    <View style={styles.row}>
      {ALL_DAYS.map((day) => (
        <Chip
          key={day}
          label={WEEKDAY_LABELS[day - 1].charAt(0)}
          accessibilityLabel={WEEKDAY_LABELS[day - 1]}
          selected={days.includes(day)}
          onPress={() => onChange(toggleDay(days, day))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
