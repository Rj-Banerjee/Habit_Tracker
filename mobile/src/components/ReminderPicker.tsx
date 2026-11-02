import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { parseReminderTime, reminderKey, REMINDER_CHOICES, space } from '@habit-tracker/core';
import { Chip, TextField } from '@habit-tracker/ui';

interface ReminderPickerProps {
  // Null means no reminder.
  value: string | null;
  onChange: (time: string | null) => void;
}

export function ReminderPicker({ value, onChange }: ReminderPickerProps) {
  const [typed, setTyped] = useState(
    value && !REMINDER_CHOICES.includes(value) ? value : ''
  );
  const parsed = parseReminderTime(typed);
  const problem = typed.trim() && !parsed ? 'Use a time like 7:30 or 19:00' : undefined;

  const type = (text: string) => {
    setTyped(text);
    const time = parseReminderTime(text);
    if (time) onChange(reminderKey(time));
  };

  const choose = (time: string | null) => {
    setTyped('');
    onChange(time);
  };

  return (
    <View style={styles.root}>
      <View style={styles.chips}>
        {REMINDER_CHOICES.map((time) => (
          <Chip key={time} label={time} selected={value === time} onPress={() => choose(time)} />
        ))}
        <Chip label="No reminder" selected={value === null} onPress={() => choose(null)} />
      </View>
      <TextField
        label="Or choose your own time"
        value={typed}
        maxLength={5}
        keyboardType="numbers-and-punctuation"
        error={problem}
        onChangeText={type}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
