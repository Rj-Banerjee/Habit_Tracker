import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buildWeekChain, habitChain, habitPatterns, heatmap, identityScores, layout, radius, space, streakHistory, topHabits } from '@habit-tracker/core';
import { Button, Chip, Text, useLayoutSize, useTheme } from '@habit-tracker/ui';
import { useProgress } from '../hooks/useProgress';
import { Forecaster } from '../progress/Forecaster';
import { Heatmap } from '../progress/Heatmap';
import { StreakHistory } from '../progress/StreakHistory';

// Two weeks of scheduled days, still, with what each repair took.
const PROGRESS_CHAIN_DAYS = 14;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, radii } = useTheme();
  return (
    <View style={[styles.section, { borderRadius: radii.md }, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="small" muted accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

interface ProgressScreenProps {
  active: boolean;
  onOpenReview: () => void;
}

export function ProgressScreen({ active, onOpenReview }: ProgressScreenProps) {
  const { colors, identity: identityColor } = useTheme();
  const size = useLayoutSize();
  const { habits, days, statuses, weeks, today, loading, loadFailed, load } = useProgress(active);
  const [chosen, setChosen] = useState<string | null>(null);

  const wide = size !== 'compact';
  const habit = habits.find((h) => h.id === chosen) ?? habits[0];

  const body = () => {
    if (loading) {
      return <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading your progress" />;
    }
    if (loadFailed) {
      return (
        <View style={styles.notice}>
          <Text>Your progress couldn&apos;t load.</Text>
          <Button label="Try again" onPress={load} />
        </View>
      );
    }
    if (!habit) return <Text>Add a habit, and your progress will show up here.</Text>;

    const top = topHabits(habits, days, today);
    return (
      <>
        <View style={[styles.grid, wide && styles.gridWide]}>
          <View style={[styles.column, wide && styles.columnWide]}>
            <Section title="Identity score, last 30 days">
              {identityScores(habits, days, today).map((score) => (
                <View key={score.identityId} style={styles.score}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: identityColor(score.colourToken).accent },
                    ]}
                  />
                  <Text style={styles.scoreName}>{score.name}</Text>
                  <Text numeric>{score.label}</Text>
                </View>
              ))}
            </Section>
          </View>
          <View style={[styles.column, wide && styles.columnWide]}>
            <Section title="Top habits this month">
              {top.length === 0 ? (
                <Text variant="small" muted>
                  Nothing logged this month yet.
                </Text>
              ) : (
                top.map((item) => (
                  <View key={item.habitId} style={styles.score}>
                    <Text style={styles.scoreName}>{item.title}</Text>
                    <Text numeric>
                      {item.done} of {item.due}
                    </Text>
                  </View>
                ))
              )}
            </Section>
          </View>
        </View>

        <View style={styles.chips}>
          {habits.map((item) => (
            <Chip
              key={item.id}
              label={item.title}
              selected={item.id === habit.id}
              onPress={() => setChosen(item.id)}
            />
          ))}
        </View>

        {habitPatterns(days, habit).length > 0 ? (
          <Section title="Your pattern">
            {habitPatterns(days, habit).map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Section>
        ) : null}

        <Section title="The last year">
          <Heatmap data={heatmap(days, habit.id, today)} identity={habit.identities.colour_token} />
        </Section>

        <View style={[styles.grid, wide && styles.gridWide]}>
          <View style={[styles.column, wide && styles.columnWide]}>
            <Section title="Streak history">
              <StreakHistory
                runs={streakHistory(days, habit.id)}
                chain={
                  habit.frequency === 'per_week'
                    ? buildWeekChain(habit.id, weeks)
                    : habitChain(habit.id, days, today, PROGRESS_CHAIN_DAYS, statuses)
                }
                habit={{ ...habit, identity: habit.identities.colour_token }}
              />
            </Section>
          </View>
          <View style={[styles.column, wide && styles.columnWide]}>
            <Section title="A year from now">
              <Forecaster key={habit.id} habit={habit} days={days} today={today} />
            </Section>
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]}>
        <Text variant="title" accessibilityRole="header">
          Progress
        </Text>
        <Button label="Sunday Review" quiet onPress={onOpenReview} />
        {body()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    gap: space.lg,
    width: '100%',
    maxWidth: layout.readingWidth,
    alignSelf: 'center',
    padding: space.lg,
    paddingTop: space.xxl,
  },
  contentWide: { maxWidth: layout.breakpoints.desktop },
  notice: { gap: space.md },
  grid: { gap: space.lg },
  gridWide: { flexDirection: 'row', alignItems: 'stretch' },
  column: { gap: space.lg },
  columnWide: { flex: 1 },
  section: {
    flexGrow: 1,
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  score: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  scoreName: { flex: 1 },
  dot: { width: space.md, height: space.md, borderRadius: radius.full },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
