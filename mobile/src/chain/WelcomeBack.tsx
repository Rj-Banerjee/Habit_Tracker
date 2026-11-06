import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Chain,
  IdentityToken,
  Moment,
  radius,
  repairHint,
  RepairHabit,
  space,
  WELCOME_BACK_TITLE,
} from '@habit-tracker/core';
import { Button, StreakChain, Text, useTheme } from '@habit-tracker/ui';

export interface WelcomeBackHabit extends RepairHabit {
  habitId: string;
  identity: IdentityToken;
  chain: Chain;
}

interface WelcomeBackProps {
  moments: Moment[];
  habits: WelcomeBackHabit[];
  onDismiss: () => void;
}

// Several things changed while they were away: one calm card with still chains, instead
// of a run of animations.
export function WelcomeBack({ moments, habits, onDismiss }: WelcomeBackProps) {
  const { colors, radii } = useTheme();
  const shown = moments.flatMap((moment) => {
    const habit = habits.find((h) => h.habitId === moment.habitId);
    return habit ? [{ moment, habit }] : [];
  });
  if (shown.length === 0) return null;

  return (
    <View style={[styles.card, { borderRadius: radii.md }, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
      <Text>{WELCOME_BACK_TITLE}</Text>
      {shown.map(({ moment, habit }) => {
        const repairOn = habit.chain.nodes.find((n) => n.date === moment.date)?.repairOn ?? null;
        return (
          <View key={moment.habitId} style={styles.habit}>
            <Text variant="small">{habit.title}</Text>
            <StreakChain chain={habit.chain} identity={habit.identity} />
            {moment.kind === 'fracture' && repairOn ? (
              <Text variant="small" muted numeric>
                {repairHint(habit, repairOn)}
              </Text>
            ) : null}
          </View>
        );
      })}
      <Button label="Got it" quiet onPress={onDismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  habit: { gap: space.xs },
});
