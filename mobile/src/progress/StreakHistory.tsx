import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chain, IdentityToken, RepairHabit, seamLabel, shortDate, space, StreakRun } from '@habit-tracker/core';
import { StreakChain, Text } from '@habit-tracker/ui';

const SHOWN = 5;

function detail(run: StreakRun) {
  const notes = [];
  if (run.repairs.length > 0) notes.push(`${run.repairs.length} repaired`);
  if (run.protectedDays.length > 0) notes.push(`${run.protectedDays.length} protected`);
  notes.push(run.fracturedOn ? `ended ${shortDate(run.fracturedOn)}` : 'still going');
  return notes.join(' · ');
}

interface StreakHistoryProps {
  runs: StreakRun[];
  // The recent days as a still chain: no animation here.
  chain?: Chain;
  habit?: RepairHabit & { identity: IdentityToken };
}

export function StreakHistory({ runs, chain, habit }: StreakHistoryProps) {
  const seams =
    chain && habit
      ? Object.fromEntries(
          chain.links.flatMap((kind, i) =>
            kind === 'seam' ? [[i + 1, seamLabel(chain.nodes[i + 1], habit)]] : []
          )
        )
      : undefined;
  const recent =
    chain && habit && chain.nodes.length > 1 ? (
      <View style={styles.chain}>
        <StreakChain chain={chain} identity={habit.identity} seamLabels={seams} />
      </View>
    ) : null;

  if (runs.length === 0) {
    return (
      <View style={styles.root}>
        {recent}
        <Text variant="small" muted>
          Streaks will show up here.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.root}>
      {recent}
      {runs.slice(0, SHOWN).map((run) => (
        <View key={run.start} style={styles.run}>
          <Text numeric>
            {run.length} {run.length === 1 ? 'day' : 'days'}, from {shortDate(run.start)}
          </Text>
          <Text variant="small" muted numeric>
            {detail(run)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  chain: { paddingBottom: space.lg },
  run: { gap: space.xs },
});
