import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AiChange, AUTOPILOT_HINT, space } from '@habit-tracker/core';
import { Button, SegmentedControl, Text } from '@habit-tracker/ui';
import { useEntitlements } from '../hooks/useEntitlements';
import { tracker } from '../services/tracker';

const OPTIONS = [
  { value: 'ask', label: 'Ask me first' },
  { value: 'auto', label: 'Autopilot' },
];

const SOURCES: Record<AiChange['source'], string> = {
  insight: 'From an insight',
  connection: 'From a connection',
  heads_up: 'From the morning heads-up',
  autopilot: 'By Autopilot',
};

const when = (at: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(at));

// Pro: whether the AI asks first (the default) or may make small changes by itself, and
// every change it has made, each undoable.
export function AutopilotSetting() {
  const { can, ready } = useEntitlements();
  const allowed = ready && can('ai.insights');
  const [value, setValue] = useState<string | null>(null);
  const [changes, setChanges] = useState<AiChange[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    Promise.resolve()
      .then(() => tracker.getAutopilot())
      .then((on) => setValue(on ? 'auto' : 'ask'))
      .catch(() => setValue(null));
    Promise.resolve()
      .then(() => tracker.getAiChanges())
      .then(setChanges)
      .catch(() => {});
  }, [allowed]);

  if (!allowed || value === null) return null;

  const undo = async (change: AiChange) => {
    setProblem(null);
    try {
      await tracker.undoAiChange(change.id);
      setChanges((all) => all.map((c) => (c.id === change.id ? { ...c, undone_at: new Date().toISOString() } : c)));
    } catch {
      setProblem("That couldn't be undone. Try again.");
    }
  };

  return (
    <View style={styles.root}>
      <Text variant="small" muted>
        AI changes
      </Text>
      <SegmentedControl
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          setValue(next);
          void Promise.resolve()
            .then(() => tracker.setAutopilot(next === 'auto'))
            .catch(() => {});
        }}
      />
      <Text variant="small" muted>
        {AUTOPILOT_HINT}
      </Text>
      {changes.length === 0 ? (
        <Text variant="small" muted>
          Nothing changed by the AI yet.
        </Text>
      ) : (
        changes.slice(0, 20).map((change) => (
          <View key={change.id} style={styles.change} testID="ai-change">
            <View style={styles.grow}>
              <Text>{change.reason ?? change.habit_title ?? 'A change'}</Text>
              <Text variant="small" muted>
                {SOURCES[change.source]} · {when(change.applied_at)}
                {change.undone_at ? ' · undone' : ''}
              </Text>
            </View>
            {change.undone_at ? null : (
              <Button label="Undo" quiet accessibilityLabel={`Undo: ${change.reason ?? ''}`} onPress={() => void undo(change)} />
            )}
          </View>
        ))
      )}
      {problem ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  change: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1, gap: 2 },
});
