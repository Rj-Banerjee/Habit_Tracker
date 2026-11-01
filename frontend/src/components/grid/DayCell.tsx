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
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${dayLabel(date)}, ${label}`}
      style={({ hovered, focused }: PressableState) => [
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor: hovered ? colors.surfaceSunken : isToday ? colors.surface : 'transparent',
          borderColor: focused ? colors.text : 'transparent',
        },
      ]}
      {...rightClick(onActions)}
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
    borderWidth: 2,
  },
});
