import React from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { SheetOption } from '../components/SheetOption';
import { HabitLevel, TodayRow } from '../services/tracker';
import { levelOptions, repairDescription } from './todayModel';

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
}

export function ShrinkSheet({ row, onClose, onLog, onRepair, onSkip }: ShrinkSheetProps) {
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
          <SheetOption label="Skip today" onPress={() => onSkip(row)} />
        </>
      ) : null}
    </BottomSheet>
  );
}
