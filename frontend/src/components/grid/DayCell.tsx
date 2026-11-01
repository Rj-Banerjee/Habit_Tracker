'use client';

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  dayLabel,
  HabitCardStatus,
  IdentityToken,
  radius,
  repairOnLabel,
  statusLabels,
} from '@habit-tracker/core';
import { PressableState, rightClick, StatusMark, useTheme } from '@habit-tracker/ui';

interface DayCellProps {
  title: string;
  date: string;
  size: number;
  status: HabitCardStatus | null;
  identity: IdentityToken;
  isToday: boolean;
  repairOn: string | null;
  editable: boolean;
  onPress: () => void;
  onActions: () => void;
}

export function DayCell({
  title,
  date,
  size,
  status,
  identity,
  isToday,
  repairOn,
  editable,
  onPress,
  onActions,
}: DayCellProps) {
  const { colors } = useTheme();

  if (status === null) {
    return <View style={{ width: size, height: size }} />;
  }

  const label = repairOn ? repairOnLabel(repairOn) : statusLabels[status];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onActions}
      delayLongPress={350}
      disabled={!editable}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${dayLabel(date)}, ${label}`}
      style={({ hovered: pointerOver }: PressableState) => [
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor:
            pointerOver && editable ? colors.surfaceSunken : isToday ? colors.surface : 'transparent',
        },
      ]}
      {...rightClick(editable ? onActions : undefined)}
    >
      <StatusMark status={status} identity={identity} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
});
