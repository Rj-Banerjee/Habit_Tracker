import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IdentityToken, radius, space } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

interface WhyCardProps {
  name: string;
  why: string;
  identity: IdentityToken;
}

export function WhyCard({ name, why, identity }: WhyCardProps) {
  const { colors, identity: identityColor } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceSunken, borderLeftColor: identityColor(identity).accent },
      ]}
    >
      <Text variant="small" muted>
        Why {name} matters
      </Text>
      <Text>{why}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs, padding: space.md, borderRadius: radius.sm, borderLeftWidth: 4 },
});
