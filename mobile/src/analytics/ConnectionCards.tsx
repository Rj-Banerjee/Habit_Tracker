import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ANSWER_LABELS, ANSWER_REPLIES, Connection, FindingAnswer, space } from '@habit-tracker/core';
import { Button, Chip, Text, useTheme } from '@habit-tracker/ui';
import { useEntitlements } from '../hooks/useEntitlements';
import { tracker } from '../services/tracker';

interface ConnectionCardsProps {
  // Null for every connection; a habit's id for its own.
  habitId: string | null;
  // After a fix or its undo, so the numbers around the cards can refresh.
  onChanged?: () => void;
  // How many to show.
  limit?: number;
  // Just this one, for the link tapped on the Habit map.
  only?: string;
}

const ANSWERS: FindingAnswer[] = ['yes', 'no', 'not_sure'];

interface Applied {
  fix: number;
  changeId: string;
}

// How habits seem to affect each other, measured, explained, with fixes. Pro only; Free
// sees the insights card's Pro note instead, so nothing is said twice.
export function ConnectionCards({ habitId, onChanged, limit = 3, only }: ConnectionCardsProps) {
  const { can, ready } = useEntitlements();
  const allowed = ready && can('ai.insights');
  const [items, setItems] = useState<Connection[] | null>(null);
  const [replies, setReplies] = useState<Map<string, string>>(new Map());
  const [confirming, setConfirming] = useState<Map<string, number>>(new Map());
  const [applied, setApplied] = useState<Map<string, Applied>>(new Map());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    Promise.resolve()
      .then(() => tracker.getConnections(habitId))
      .then((rows) => live && setItems(rows))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [allowed, habitId]);

  if (!allowed || items === null || items.length === 0) return null;

  const set = <T,>(setter: React.Dispatch<React.SetStateAction<Map<string, T>>>, key: string, value: T | null) =>
    setter((all) => {
      const next = new Map(all);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });

  const answer = async (item: Connection, value: FindingAnswer) => {
    setProblem(null);
    try {
      await tracker.answerConnection(item.id, value);
      set(setReplies, item.id, ANSWER_REPLIES[value]);
      setItems((all) => all?.map((c) => (c.id === item.id ? { ...c, answer: value } : c)) ?? all);
    } catch {
      setProblem("That didn't save. Try again in a moment.");
    }
  };

  const apply = async (item: Connection, fix: number) => {
    setBusy(true);
    setProblem(null);
    try {
      const changeId = await tracker.applyConnectionFix(item.id, fix);
      set(setApplied, item.id, { fix, changeId });
      set(setConfirming, item.id, null);
      onChanged?.();
    } catch {
      setProblem("That didn't go through. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const undo = async (item: Connection, change: Applied) => {
    setBusy(true);
    setProblem(null);
    try {
      await tracker.undoAiChange(change.changeId);
      set(setApplied, item.id, null);
      onChanged?.();
    } catch {
      setProblem("That couldn't be undone. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.list}>
      {items.filter((item) => !only || item.id === only).slice(0, limit).map((item) => (
        <ConnectionCard
          key={item.id}
          item={item}
          reply={replies.get(item.id) ?? null}
          confirming={confirming.get(item.id) ?? null}
          applied={applied.get(item.id) ?? null}
          busy={busy}
          onAnswer={(value) => void answer(item, value)}
          onChoose={(fix) => set(setConfirming, item.id, fix)}
          onCancel={() => set(setConfirming, item.id, null)}
          onApply={(fix) => void apply(item, fix)}
          onUndo={(change) => void undo(item, change)}
        />
      ))}
      {problem ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

interface ConnectionCardProps {
  item: Connection;
  reply: string | null;
  confirming: number | null;
  applied: Applied | null;
  busy: boolean;
  onAnswer: (answer: FindingAnswer) => void;
  onChoose: (fix: number) => void;
  onCancel: () => void;
  onApply: (fix: number) => void;
  onUndo: (change: Applied) => void;
}

export function ConnectionCard({
  item, reply, confirming, applied, busy, onAnswer, onChoose, onCancel, onApply, onUndo,
}: ConnectionCardProps) { // prettier-ignore
  const { colors, radii } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}
      testID="connection-card"
    >
      <Text>{item.explanation}</Text>
      <Text variant="small" muted numeric>
        Measured over {item.sample} days{item.confidence === 'high' ? ', a clear pattern' : ''}.
      </Text>
      {item.question ? (
        <View style={styles.field}>
          <Text variant="small">{item.question}</Text>
          <View style={styles.row} accessibilityRole="radiogroup">
            {ANSWERS.map((value) => (
              <Chip
                key={value}
                label={ANSWER_LABELS[value]}
                selected={item.answer === value}
                onPress={() => onAnswer(value)}
              />
            ))}
          </View>
          {reply ? (
            <Text variant="small" muted accessibilityLiveRegion="polite">
              {reply}
            </Text>
          ) : null}
        </View>
      ) : null}
      {applied ? (
        <View style={styles.row}>
          <Text variant="small" muted style={styles.grow}>
            Done: {item.fixes[applied.fix]?.label}.
          </Text>
          <Button label="Undo" quiet disabled={busy} onPress={() => onUndo(applied)} />
        </View>
      ) : confirming !== null ? (
        <View style={styles.field}>
          <Text variant="small" muted accessibilityLiveRegion="polite">
            {item.fixes[confirming]?.label}? It starts from today, and can be undone.
          </Text>
          <View style={styles.row}>
            <Button label="Yes, do it" disabled={busy} onPress={() => onApply(confirming)} />
            <Button label="Cancel" quiet onPress={onCancel} />
          </View>
        </View>
      ) : item.fixes.length > 0 && item.answer !== 'no' ? (
        <View style={styles.fixes}>
          {item.fixes.map((fix, index) => (
            <Button key={fix.label} label={fix.label} quiet disabled={busy} onPress={() => onChoose(index)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  card: { padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth },
  field: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  fixes: { alignItems: 'flex-start', gap: space.xs },
  grow: { flex: 1 },
});
