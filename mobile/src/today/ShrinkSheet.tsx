import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  HabitLevel,
  isWeekly,
  levelOptions,
  repairDescription,
  space,
  TodayRow,
  usesTarget,
} from '@habit-tracker/core';
import { BottomSheet, Button, SheetOption, TextField } from '@habit-tracker/ui';

const LEVEL_NAMES: Record<HabitLevel, string> = {
  full: 'Full version',
  minimum: 'Minimum version',
  setup: 'Just set up',
};

interface ShrinkSheetProps {
  row: TodayRow | null;
  onClose: () => void;
  onLog: (row: TodayRow, level: HabitLevel) => void;
  onRepair: (row: TodayRow) => void;
  onSkip: (row: TodayRow) => void;
  onEdit: (row: TodayRow) => void;
  onDetails?: (row: TodayRow) => void;
  onFocus?: (row: TodayRow) => void;
  // "3" or "2-3 pages", added to the day. Resolves true once it's in.
  onAddAmount?: (row: TodayRow, text: string) => Promise<boolean>;
}

export function ShrinkSheet({
  row,
  onClose,
  onLog,
  onRepair,
  onSkip,
  onEdit,
  onDetails,
  onFocus,
  onAddAmount,
}: ShrinkSheetProps) {
  // Typed text belongs to the habit and day it was typed for, so another card starts empty.
  const key = row ? `${row.habit_id}:${row.day}` : '';
  const [entry, setEntry] = useState({ key: '', text: '' });
  const amount = entry.key === key ? entry.text : '';
  const setAmount = (text: string) => setEntry({ key, text });

  const add = async () => {
    if (row && onAddAmount && (await onAddAmount(row, amount))) setAmount('');
  };

  return (
    <BottomSheet visible={row !== null} title={row?.title ?? ''} onClose={onClose}>
      {row ? (
        <>
          {onAddAmount && usesTarget(row.habit_type) ? (
            <View style={styles.amount}>
              <View style={styles.field}>
                <TextField
                  label="Add an amount"
                  hint={row.unit ? `In ${row.unit}, or another unit. It adds to today.` : 'It adds to today.'}
                  placeholder={row.unit ? `3 ${row.unit}` : '3'}
                  value={amount}
                  onChangeText={setAmount}
                  onSubmitEditing={() => void add()}
                />
              </View>
              <Button label="Add" disabled={!amount.trim()} onPress={() => void add()} />
            </View>
          ) : null}
          {levelOptions(row).map((option) => (
            <SheetOption
              key={option.level}
              label={LEVEL_NAMES[option.level]}
              description={option.description === row.title ? undefined : option.description}
              onPress={() => onLog(row, option.level)}
            />
          ))}
          {row.can_repair ? (
            <SheetOption
              label="Repair the last miss"
              description={repairDescription(row)}
              onPress={() => onRepair(row)}
            />
          ) : null}
          {onFocus && row.is_today ? (
            <SheetOption label="Focus" description="Tunnel Vision with a timer" onPress={() => onFocus(row)} />
          ) : null}
          {/* A times-per-week habit owes no single day, so there's nothing to skip. */}
          {isWeekly(row) ? null : <SheetOption label="Skip today" onPress={() => onSkip(row)} />}
          {onDetails ? <SheetOption label="Streak and details" onPress={() => onDetails(row)} /> : null}
          <SheetOption label="Edit habit" onPress={() => onEdit(row)} />
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  amount: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  field: { flex: 1 },
});
