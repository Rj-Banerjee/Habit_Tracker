import React from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, RULE_CARDS, space, StreakRule } from '@habit-tracker/core';
import { Button, Text, useTheme } from '@habit-tracker/ui';

interface RuleCardProps {
  rule: StreakRule;
  onDismiss: () => void;
}

export function RuleCard({ rule, onDismiss }: RuleCardProps) {
  return <TipCard text={RULE_CARDS[rule]} onDismiss={onDismiss} />;
}

// A one-time note with "Got it".
export function TipCard({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const { colors, radii } = useTheme();
  return (
    <View style={[styles.card, { borderRadius: radii.md }, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
      <Text>{text}</Text>
      <Button label="Got it" quiet onPress={onDismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
