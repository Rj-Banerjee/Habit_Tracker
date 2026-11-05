import React from 'react';
import { HabitLevel, levelOptions, repairDescription, TodayRow } from '@habit-tracker/core';
import { BottomSheet, SheetOption } from '@habit-tracker/ui';

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
}

export function ShrinkSheet({ row, onClose, onLog, onRepair, onSkip, onEdit, onDetails, onFocus }: ShrinkSheetProps) {
  return (
    <BottomSheet visible={row !== null} title={row?.title ?? ''} onClose={onClose}>
      {row ? (
        <>
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
          <SheetOption label="Skip today" onPress={() => onSkip(row)} />
          {onDetails ? <SheetOption label="Streak and details" onPress={() => onDetails(row)} /> : null}
          <SheetOption label="Edit habit" onPress={() => onEdit(row)} />
        </>
      ) : null}
    </BottomSheet>
  );
}
