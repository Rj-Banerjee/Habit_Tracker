import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@habit-tracker/core';
import { Chip } from './Chip';
import { Text } from './Text';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  // What the number means, such as "times a week". Read out with it.
  unit?: string;
  // Going past max calls this instead, for "7 a week is every day".
  onPastMax?: () => void;
  // How far one tap moves it. Hours of sleep go by halves.
  step?: number;
}

// A number set with − and +, readable and adjustable by screen readers in one go.
export function Stepper({ label, value, min, max, onChange, unit, onPastMax, step = 1 }: StepperProps) {
  const spoken = unit ? `${value} ${unit}` : String(value);
  // Rounded, so halves never drift to 6.499999.
  const by = (delta: number) => Math.round((value + delta) / step) * step;
  const up = () => (value < max ? onChange(Math.min(max, by(step))) : onPastMax?.());
  const down = () => value > min && onChange(Math.max(min, by(-step)));
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: spoken }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => (event.nativeEvent.actionName === 'increment' ? up() : down())}
    >
      <Chip label="−" accessibilityLabel={`Fewer, ${label}`} selected={false} onPress={down} />
      <Text numeric style={styles.value}>
        {spoken}
      </Text>
      <Chip label="+" accessibilityLabel={`More, ${label}`} selected={false} onPress={up} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  value: { minWidth: space.xxl, textAlign: 'center' },
});
