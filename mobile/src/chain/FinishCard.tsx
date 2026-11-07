import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  addDays,
  buildWeekChain,
  celebrationText,
  Chain,
  CHAIN_WEEKS,
  CompletedHabit,
  finishCaption,
  habitChain,
  radius,
  space,
} from '@habit-tracker/core';
import { Button, Text, useTheme } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';
import { useMotionSettings } from './useMotionSettings';
import { MomentChain } from './MomentChain';

// Enough days before the end to find its last 7 scheduled ones.
const LOOKBACK_DAYS = 27;

// The one calm celebration for a habit that has run its course: its chain plays the
// finish once, a soft light along it and then its end cap.
export function FinishCard({ habit, onDismiss }: { habit: CompletedHabit; onDismiss: () => void }) {
  const { colors, radii } = useTheme();
  const settings = useMotionSettings();
  const [chain, setChain] = useState<Chain | null>(null);

  useEffect(() => {
    let live = true;
    const from = addDays(habit.ends_on, -(habit.frequency === 'per_week' ? 7 * CHAIN_WEEKS : LOOKBACK_DAYS));
    Promise.resolve()
      .then(() =>
        habit.frequency === 'per_week'
          ? tracker.getWeekStatuses(from, habit.ends_on).then((weeks) => buildWeekChain(habit.habit_id, weeks))
          : Promise.all([tracker.getHabitDays(from, habit.ends_on), tracker.getDayStatuses(from, habit.ends_on)]).then(
              ([days, statuses]) => habitChain(habit.habit_id, days, habit.ends_on, undefined, statuses)
            )
      )
      .then((built) => live && setChain({ ...built, ended: true }))
      // The words still celebrate without a chain.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [habit]);

  const last = chain?.nodes[chain.nodes.length - 1];

  return (
    <View
      style={[
        styles.card,
        { borderRadius: radii.md, backgroundColor: colors.surfaceSunken, borderColor: colors.border },
      ]}
    >
      <Text>{celebrationText(habit)}</Text>
      {chain && last ? (
        <MomentChain
          chain={chain}
          moment={{ kind: 'finish', habitId: habit.habit_id, date: last.date }}
          identity={habit.colour_token}
          settings={settings}
          captions={{ caption: finishCaption(habit.days_done) }}
        />
      ) : null}
      <Button label="Got it" quiet onPress={onDismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
