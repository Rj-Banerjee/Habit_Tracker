import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Insight, INSIGHTS_LOCKED, insightActionLabel, insightConfirm, space } from '@habit-tracker/core';
import { Button, Text, useTheme } from '@habit-tracker/ui';
import { useEntitlements } from '../hooks/useEntitlements';
import { tracker } from '../services/tracker';

interface InsightCardsProps {
  // Null for the Overview's.
  habitId: string | null;
  // Habit names by id, for saying what an action will change.
  titles: Record<string, string>;
  // After an action or its undo, so the numbers around the cards can refresh.
  onChanged?: () => void;
}

type CardState = 'idle' | 'confirming' | 'working';

// 2–3 insights, found and worded each night on the server, each with one action.
export function InsightCards({ habitId, titles, onChanged }: InsightCardsProps) {
  const { can, ready } = useEntitlements();
  const { colors, radii } = useTheme();
  // Only once the plan is known, so Free never asks and Pro never sees the lock flash.
  const allowed = ready && can('ai.insights');
  const [items, setItems] = useState<Insight[] | null>(null);
  const [states, setStates] = useState<Map<string, CardState>>(new Map());
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    Promise.resolve()
      .then(() => tracker.getInsights(habitId))
      .then((rows) => live && setItems(rows))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [allowed, habitId]);

  const card = { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md };

  if (!ready) return null;
  if (!allowed) {
    return (
      <View style={[styles.card, card]}>
        <Text variant="small" muted>
          {INSIGHTS_LOCKED}
        </Text>
      </View>
    );
  }
  if (items === null) return null;
  if (items.length === 0) {
    return (
      <Text variant="small" muted>
        Insights show up here once there are a few weeks to look at. They&apos;re worked out each night.
      </Text>
    );
  }

  const stateOf = (id: string) => states.get(id) ?? 'idle';
  const setState = (id: string, state: CardState) => setStates((all) => new Map(all).set(id, state));
  const replace = (id: string, applied: string | null) =>
    setItems((all) => all?.map((item) => (item.id === id ? { ...item, applied_at: applied } : item)) ?? all);

  const act = async (item: Insight, undo: boolean) => {
    setState(item.id, 'working');
    setProblem(null);
    try {
      if (undo) await tracker.undoInsight(item.id);
      else await tracker.applyInsight(item.id);
      replace(item.id, undo ? null : new Date().toISOString());
      onChanged?.();
    } catch {
      setProblem("That didn't go through. Nothing was changed.");
    } finally {
      setState(item.id, 'idle');
    }
  };

  const dismiss = async (item: Insight) => {
    setState(item.id, 'working');
    try {
      await tracker.dismissInsight(item.id);
      setItems((all) => all?.filter((other) => other.id !== item.id) ?? all);
    } catch {
      setProblem("That didn't go through. Try again in a moment.");
      setState(item.id, 'idle');
    }
  };

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const state = stateOf(item.id);
        const title = titles[item.action?.habit_id ?? item.habit_id ?? ''] ?? 'This habit';
        return (
          <View key={item.id} style={[styles.card, card]} testID="insight-card">
            <Text>{item.text}</Text>
            {item.applied_at ? (
              <View style={styles.row}>
                <Text variant="small" muted style={styles.grow}>
                  Done.
                </Text>
                <Button label="Undo" quiet disabled={state === 'working'} onPress={() => void act(item, true)} />
              </View>
            ) : state === 'confirming' && item.action ? (
              <View style={styles.confirm}>
                <Text variant="small" muted accessibilityLiveRegion="polite">
                  {insightConfirm(item.action, title)}
                </Text>
                <View style={styles.row}>
                  <Button label="Yes, do it" onPress={() => void act(item, false)} />
                  <Button label="Cancel" quiet onPress={() => setState(item.id, 'idle')} />
                </View>
              </View>
            ) : (
              <View style={styles.row}>
                {item.action ? (
                  <Button
                    label={insightActionLabel(item.action)}
                    disabled={state === 'working'}
                    onPress={() => setState(item.id, 'confirming')}
                  />
                ) : null}
                <Button
                  label="Not useful"
                  quiet
                  accessibilityLabel="Not useful: hide this for 30 days"
                  disabled={state === 'working'}
                  onPress={() => void dismiss(item)}
                />
              </View>
            )}
          </View>
        );
      })}
      {problem ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  card: { padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  confirm: { gap: space.sm },
  grow: { flex: 1 },
});
