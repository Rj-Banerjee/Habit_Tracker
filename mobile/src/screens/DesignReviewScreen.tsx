import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { HabitCard } from '../components/HabitCard';
import { HabitCardStatus, statusLabels } from '../components/habitCardStatus';
import { StatusMark } from '../components/StatusMark';
import { Text } from '../components/Text';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import {
  IdentityToken,
  identityColors,
  radius,
  space,
  ThemeColors,
  ThemeName,
} from '../theme/tokens';

const SWATCHES: Array<keyof ThemeColors> = [
  'canvas',
  'surface',
  'surfaceSunken',
  'border',
  'text',
  'textMuted',
  'hollow',
];

const SAMPLE_CARDS: Array<{
  title: string;
  status: HabitCardStatus;
  identity: IdentityToken;
  streak?: number;
  detail?: string;
}> = [
  { title: 'Deep work', status: 'due', identity: 'identity-3', streak: 11, detail: '2 hours' },
  { title: 'Morning run', status: 'done', identity: 'identity-1', streak: 24, detail: '5 km' },
  { title: 'Read', status: 'doneMinimum', identity: 'identity-5', streak: 8, detail: '1 page' },
  { title: 'Meditate', status: 'skipped', identity: 'identity-2', streak: 15, detail: 'Sick' },
  { title: 'Stretch', status: 'missed', identity: 'identity-1', streak: 0 },
  { title: 'Journal', status: 'repaired', identity: 'identity-6', streak: 31 },
  { title: 'Plan tomorrow', status: 'protected', identity: 'identity-7', streak: 19 },
];

function ThemeColumn() {
  const { name, colors } = useTheme();
  const [cards, setCards] = useState(SAMPLE_CARDS);

  const toggle = (index: number) =>
    setCards((prev) =>
      prev.map((card, i) => {
        if (i !== index) return card;
        const logged = card.status === 'done';
        return {
          ...card,
          status: logged ? 'due' : 'done',
          streak: (card.streak ?? 0) + (logged ? -1 : 1),
        };
      })
    );

  const identities = Object.keys(identityColors[name]) as IdentityToken[];

  return (
    <View style={[styles.column, { backgroundColor: colors.canvas }]}>
      <Text variant="small" muted>
        {name === 'light' ? 'Light' : 'Dark'}
      </Text>

      <View style={styles.section}>
        <Text variant="title">Habit card states</Text>
        <Text variant="small" muted>
          Tap a card to log it.
        </Text>
        <View style={styles.stack}>
          {cards.map((card, index) => (
            <HabitCard key={card.title} {...card} onPress={() => toggle(index)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="title">State marks</Text>
        <View style={styles.marks}>
          {(Object.keys(statusLabels) as HabitCardStatus[]).map((status) => (
            <View key={status} style={styles.markRow}>
              <StatusMark status={status} identity="identity-3" />
              <Text variant="small" muted>
                {statusLabels[status]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="title">Identity accents</Text>
        <View style={styles.marks}>
          {identities.map((token) => (
            <View key={token} style={styles.markRow}>
              <StatusMark status="done" identity={token} />
              <Text variant="small" muted>
                {identityColors[name][token].label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="title">Type</Text>
        <Text variant="display">A letter to you</Text>
        <Text variant="title">Title size</Text>
        <Text>Body size, for habit names and coach messages.</Text>
        <Text variant="small" muted>
          Small size, for details and labels
        </Text>
        <Text variant="title" numeric>
          111 / 888 / 407
        </Text>
        <Text variant="small" muted>
          Tabular numerals keep digits aligned.
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="title">Neutrals</Text>
        <View style={styles.swatches}>
          {SWATCHES.map((key) => (
            <View key={key} style={styles.swatch}>
              <View
                style={[styles.chip, { backgroundColor: colors[key], borderColor: colors.border }]}
              />
              <Text variant="small" muted>
                {key}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function DesignReviewScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 800;
  const themes: ThemeName[] = ['light', 'dark'];

  return (
    <ScrollView contentContainerStyle={wide && styles.row}>
      {themes.map((name) => (
        <ThemeProvider key={name} forced={name}>
          <ThemeColumn />
        </ThemeProvider>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  column: { flex: 1, gap: space.xl, padding: space.lg, paddingTop: space.xxl },
  section: { gap: space.sm },
  stack: { gap: space.sm, marginTop: space.sm },
  marks: { gap: space.sm, marginTop: space.xs },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swatch: { gap: space.xs },
  chip: { width: 64, height: 40, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
});
