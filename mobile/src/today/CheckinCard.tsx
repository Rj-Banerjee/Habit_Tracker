import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Checkin, CheckinAnswer, SCALE_WORDS, SLEEP_DEFAULT, SLEEP_MAX, SLEEP_STEP, space } from '@habit-tracker/core';
import { Button, Chip, Stepper, Text, useTheme } from '@habit-tracker/ui';

interface CheckinCardProps {
  // What's already in for today, say sleep from a voice check-in.
  existing: Checkin | null;
  problem: string | null;
  onSave: (answer: CheckinAnswer) => void;
  onSkip: () => void;
}

const LEVELS = [1, 2, 3, 4, 5];

function Scale({ name, value, onChange }: { name: string; value: number | null; onChange: (value: number) => void }) {
  return (
    <View style={styles.field}>
      <Text variant="small" muted>
        {name}
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {LEVELS.map((level) => (
          <Chip
            key={level}
            label={String(level)}
            accessibilityLabel={`${name} ${level} of 5, ${SCALE_WORDS[level - 1].toLowerCase()}`}
            selected={value === level}
            onPress={() => onChange(level)}
          />
        ))}
      </View>
    </View>
  );
}

// Energy, sleep and mood in a few taps. Skippable, and quiet about it.
export function CheckinCard({ existing, problem, onSave, onSkip }: CheckinCardProps) {
  const { colors, radii } = useTheme();
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [mood, setMood] = useState<number | null>(existing?.mood ?? null);
  const [sleep, setSleep] = useState<number>(existing?.sleep_hours ?? SLEEP_DEFAULT);

  const save = () =>
    onSave({
      sleep,
      ...(energy !== null ? { energy } : {}),
      ...(mood !== null ? { mood } : {}),
    });

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}
      testID="checkin-card"
    >
      <Text variant="small" muted accessibilityRole="header">
        Daily check-in
      </Text>
      <Scale name="Energy" value={energy} onChange={setEnergy} />
      <Stepper
        label="Hours slept"
        unit={sleep === 1 ? 'hour slept' : 'hours slept'}
        value={sleep}
        min={0}
        max={SLEEP_MAX}
        step={SLEEP_STEP}
        onChange={setSleep}
      />
      <Scale name="Mood" value={mood} onChange={setMood} />
      {problem ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button label="Save" disabled={energy === null && mood === null} onPress={save} />
        <Button label="Skip for today" quiet onPress={onSkip} />
      </View>
      <Text variant="small" muted>
        Only you can see this.
      </Text>
    </View>
  );
}

interface CheckinOfferProps {
  onKeep: () => void;
  onTurnOff: () => void;
}

// Asked once, after 3 skipped days in a row.
export function CheckinOffer({ onKeep, onTurnOff }: CheckinOfferProps) {
  const { colors, radii } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}>
      <Text>Turn off the daily check-in? You can bring it back any time in You.</Text>
      <View style={styles.row}>
        <Button label="Keep it" quiet onPress={onKeep} />
        <Button label="Turn off" quiet onPress={onTurnOff} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth },
  field: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
});
