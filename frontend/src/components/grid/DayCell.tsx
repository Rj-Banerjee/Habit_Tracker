'use client';

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  dayLabel,
  HabitCardStatus,
  IdentityToken,
  radius,
  repairOnLabel,
  statusLabels,
} from '@habit-tracker/core';
import { PressableState, rightClick, StatusMark, Text, useTheme } from '@habit-tracker/ui';

interface DayCellProps {
  title: string;
  date: string;
  size: number;
  status: HabitCardStatus | null;
  identity: IdentityToken;
  isToday: boolean;
  repairOn: string | null;
  // A repaired day: what the repair took, shown on hover.
  repairedLabel?: string | null;
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
  repairedLabel,
  editable,
  onPress,
  onActions,
}: DayCellProps) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);

  if (status === null) {
    return <View style={{ width: size, height: size }} />;
  }

  // A past day can't change, but a repaired one still says what the repair took on hover.
  const hoverable = status === 'repaired' && Boolean(repairedLabel);

  const label = repairOn
    ? repairOnLabel(repairOn)
    : status === 'repaired' && repairedLabel
      ? repairedLabel
      : statusLabels[status];

  return (
    <Pressable
      onPress={editable ? onPress : undefined}
      onLongPress={editable ? onActions : undefined}
      delayLongPress={350}
      disabled={!editable && !hoverable}
      accessibilityState={{ disabled: !editable }}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${dayLabel(date)}, ${label}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
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
      {hovered && status === 'repaired' && repairedLabel ? (
        <View style={[styles.tip, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
          <Text variant="small" numeric numberOfLines={1}>
            {repairedLabel}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tip: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    zIndex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
