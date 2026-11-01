'use client';

import React, { useState } from 'react';
import { dayLabel, HabitLevel, RangeHabit, repairOnLabel } from '@habit-tracker/core';
import { BottomSheet, SheetOption, SkipSheet, Text } from '@habit-tracker/ui';

const LEVEL_NAMES: Record<HabitLevel, string> = {
  full: 'Full version',
  minimum: 'Minimum version',
  setup: 'Just set up',
};

const LEVEL_ORDER: HabitLevel[] = ['full', 'minimum', 'setup'];

export interface DayTarget {
  habit: RangeHabit;
  date: string;
  logged: boolean;
  repairOn: string | null;
}

interface DayActionsSheetProps {
  target: DayTarget | null;
  onClose: () => void;
  onLog: (target: DayTarget, level: HabitLevel) => void;
  onUndo: (target: DayTarget) => void;
  onSkip: (target: DayTarget, reason: string) => void;
}

export function DayActionsSheet({ target, onClose, onLog, onUndo, onSkip }: DayActionsSheetProps) {
  const [skipping, setSkipping] = useState(false);

  const levels = target
    ? [...target.habit.habit_levels].sort(
        (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
      )
    : [];

  return (
    <>
      <BottomSheet
        visible={target !== null && !skipping}
        title={target ? `${target.habit.title}, ${dayLabel(target.date)}` : ''}
        onClose={onClose}
      >
        {target?.repairOn ? (
          <Text variant="small" muted>
            {repairOnLabel(target.repairOn)}
          </Text>
        ) : null}
        {levels.map((option) => (
          <SheetOption
            key={option.level}
            label={LEVEL_NAMES[option.level]}
            description={option.description}
            onPress={() => target && onLog(target, option.level)}
          />
        ))}
        {target?.logged ? (
          <SheetOption label="Undo" onPress={() => onUndo(target)} />
        ) : (
          <SheetOption label="Skip this day" onPress={() => setSkipping(true)} />
        )}
      </BottomSheet>
      <SkipSheet
        visible={target !== null && skipping}
        onClose={() => {
          setSkipping(false);
          onClose();
        }}
        onSkip={(reason) => {
          setSkipping(false);
          if (target) onSkip(target, reason);
        }}
      />
    </>
  );
}
