import React from 'react';
import { StyleSheet, View } from 'react-native';
import { shortDate, space, StreakRun } from '@habit-tracker/core';
import { Text } from '@habit-tracker/ui';

const SHOWN = 5;

function detail(run: StreakRun) {
  const notes = [];
  if (run.repairs.length > 0) notes.push(`${run.repairs.length} repaired`);
  if (run.protectedDays.length > 0) notes.push(`${run.protectedDays.length} protected`);
  notes.push(run.fracturedOn ? `ended ${shortDate(run.fracturedOn)}` : 'still going');
  return notes.join(' · ');
}

export function StreakHistory({ runs }: { runs: StreakRun[] }) {
  if (runs.length === 0) {
    return (
      <Text variant="small" muted>
        Streaks will show up here.
      </Text>
    );
  }
  return (
    <View style={styles.root}>
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
  run: { gap: space.xs },
});
