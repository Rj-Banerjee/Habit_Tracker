import React from 'react';
import { StyleSheet, View } from 'react-native';
import { HEADS_UP_FIX, HeadsUp, headsUpText, space, Warning, warningText } from '@habit-tracker/core';
import { Button, Text, useTheme } from '@habit-tracker/ui';

function Card({ children, testID }: { children: React.ReactNode; testID: string }) {
  const { colors, radii } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}
    >
      {children}
    </View>
  );
}

// In the morning, when today's plan matches a link that competes the day after.
export function HeadsUpCard({ headsUp, onApply, onDismiss }: { headsUp: HeadsUp; onApply: () => void; onDismiss: () => void }) {
  return (
    <Card testID="heads-up">
      <Text>{headsUpText(headsUp)}</Text>
      <View style={styles.row}>
        <Button label={HEADS_UP_FIX(headsUp)} onPress={onApply} />
        <Button label="Not today" quiet onPress={onDismiss} />
      </View>
    </Card>
  );
}

// Only for serious, sustained patterns; at most once a week.
export function WarningCard({ warning, onSnooze }: { warning: Warning; onSnooze: () => void }) {
  return (
    <Card testID="warning">
      <Text>{warningText(warning)}</Text>
      <View style={styles.row}>
        <Button label="Got it" quiet accessibilityLabel="Got it: hide this for a week" onPress={onSnooze} />
      </View>
    </Card>
  );
}

interface AutopilotNoticeProps {
  changes: { id: string; habit_title: string; reason: string }[];
  onUndo: (id: string) => void;
  onKeep: () => void;
}

// What Autopilot changed on its own, each with Undo.
export function AutopilotNotice({ changes, onUndo, onKeep }: AutopilotNoticeProps) {
  return (
    <Card testID="autopilot-notice">
      <Text variant="small" muted accessibilityRole="header">
        Autopilot
      </Text>
      {changes.map((change) => (
        <View key={change.id} style={styles.row}>
          <Text style={styles.grow}>{change.reason}.</Text>
          <Button label="Undo" quiet accessibilityLabel={`Undo: ${change.reason}`} onPress={() => onUndo(change.id)} />
        </View>
      ))}
      <Button label="Keep" quiet onPress={onKeep} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
});
