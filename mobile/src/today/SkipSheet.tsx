import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { layout, radius, space, textStyles, TodayRow } from '@habit-tracker/core';
import { BottomSheet, Button, SheetOption, Text, useTheme } from '@habit-tracker/ui';

const REASONS = ['Sick', 'Travelling', 'Rest day', 'Too busy'];

interface SkipSheetProps {
  row: TodayRow | null;
  onClose: () => void;
  onSkip: (row: TodayRow, reason: string) => void;
}

export function SkipSheet({ row, onClose, onSkip }: SkipSheetProps) {
  const { colors } = useTheme();
  const [other, setOther] = useState('');

  const choose = (reason: string) => {
    if (!row) return;
    setOther('');
    onSkip(row, reason);
  };

  return (
    <BottomSheet visible={row !== null} title="Why skip today?" onClose={onClose}>
      <Text variant="small" muted>
        A skip pauses your streak. You get 2 in any 7 days.
      </Text>
      {REASONS.map((reason) => (
        <SheetOption key={reason} label={reason} onPress={() => choose(reason)} />
      ))}
      <TextInput
        value={other}
        onChangeText={setOther}
        placeholder="Another reason"
        placeholderTextColor={colors.textMuted}
        maxLength={200}
        accessibilityLabel="Another reason"
        style={[styles.input, textStyles.body, { color: colors.text, borderColor: colors.border }]}
      />
      <Button label="Skip" disabled={other.trim() === ''} onPress={() => choose(other.trim())} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
