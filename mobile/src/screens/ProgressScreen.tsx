import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AnalyticsRange,
  HeadlineCard,
  headline,
  headlineCards,
  identityScores,
  layout,
  overviewPeriods,
  pairLines,
  percentLabel,
  progressHabitOf,
  radius,
  RANGE_LABELS,
  ranking,
  space,
  trendArrow,
  weekBars,
  withinRange,
} from '@habit-tracker/core';
import { Button, Chip, SegmentedControl, Text, useLayoutSize, useTheme } from '@habit-tracker/ui';
import { DayBars } from '../analytics/DayBars';
import { Stat, StatGrid } from '../analytics/StatGrid';
import { useOverview } from '../hooks/useOverview';
import { HabitDetailScreen } from './HabitDetailScreen';

const RANGES: AnalyticsRange[] = ['7d', '30d', '90d', '1y', 'all'];
const TREND_WORDS = { up: 'up', down: 'down', same: 'about the same as' } as const;

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

// A headline card as a tile: the arrow beside the value, what it was under it when comparing.
const tileOf = (card: HeadlineCard, compare: boolean): Stat => {
  const arrow = card.trend ? ` ${trendArrow(card.trend)}` : '';
  const before = compare && card.before !== null ? `was ${card.before}` : undefined;
  const note = [card.note, before].filter(Boolean).join(' · ') || undefined;
  const trend = card.trend && card.before !== null ? `, ${TREND_WORDS[card.trend]} ${card.trend === 'same' ? '' : 'from '}${card.before} before` : '';
  return {
    label: card.label,
    value: `${card.value}${arrow}`,
    note,
    spoken: `${card.label}: ${card.value}${card.note ? `, ${card.note}` : ''}${trend}`,
  };
};

interface ProgressScreenProps {
  active: boolean;
  onOpenReview: () => void;
  onEditHabit?: (habitId: string) => void;
}

export function ProgressScreen({ active, onOpenReview, onEditHabit }: ProgressScreenProps) {
  const { colors, identity: identityColor } = useTheme();
  const size = useLayoutSize();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [compare, setCompare] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { loaded, loading, failed, load } = useOverview(active, range);
  const wide = size !== 'compact';

  const view = useMemo(() => {
    if (!loaded || loaded.data.habits.length === 0) return null;
    const { data, today } = loaded;
    const firstDay = data.habits.map((h) => h.starts_on).sort()[0];
    const periods = overviewPeriods(range, today, firstDay);
    const now = withinRange(data, periods.current.from, periods.current.to);
    const before = periods.previous ? withinRange(data, periods.previous.from, periods.previous.to) : null;
    // Strength as it stood at the end of each period, from all the history before it.
    const beforeHistory = periods.previous ? withinRange(data, data.from, periods.previous.to) : null;
    return {
      today,
      cards: headlineCards(
        headline(now, data),
        before && beforeHistory ? headline(before, beforeHistory) : null
      ),
      bars: weekBars(now),
      // Strength as it stands now, from all the history; completion for the range.
      ranked: ranking(now, data),
      pairs: pairLines(now),
      identity: identityScores(data.habits.map(progressHabitOf), loaded.identityDays, today),
      habits: data.habits,
    };
  }, [loaded, range]);

  const detail = view?.habits.find((h) => h.id === detailId);

  const body = () => {
    if (loading && !loaded) {
      return <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading your progress" />;
    }
    if (failed && !loaded) {
      return (
        <View style={styles.notice}>
          <Text>Your progress couldn&apos;t load.</Text>
          <Button label="Try again" onPress={load} />
        </View>
      );
    }
    if (!view) return <Text>Add a habit, and your progress will show up here.</Text>;

    return (
      <>
        <View style={styles.controls}>
          <SegmentedControl
            options={RANGES.map((value) => ({ value, label: RANGE_LABELS[value] }))}
            value={range}
            onChange={setRange}
          />
          {range === 'all' ? null : (
            <Chip
              label="Compare to previous period"
              selected={compare}
              onPress={() => setCompare((on) => !on)}
            />
          )}
        </View>

        <StatGrid stats={view.cards.map((card) => tileOf(card, compare && range !== 'all'))} />

        <Section title="Day by day">
          <DayBars weeks={view.bars} />
        </Section>

        <View style={[styles.grid, wide && styles.gridWide]}>
          <View style={[styles.column, wide && styles.columnWide]}>
            <Section title="Your habits, strongest first">
              {view.ranked.map((item, index) => (
                <Pressable
                  key={item.habitId}
                  onPress={() => setDetailId(item.habitId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${index + 1}. ${item.title}: strength ${item.strength}, ${percentLabel(item.completionRate)} done. Open details`}
                  style={styles.rank}
                >
                  <View style={[styles.dot, { backgroundColor: identityColor(item.colourToken).accent }]} />
                  <Text style={styles.rankName}>{item.title}</Text>
                  <Text numeric muted variant="small">
                    {percentLabel(item.completionRate)}
                  </Text>
                  <Text numeric style={styles.rankStrength}>
                    {item.strength}
                  </Text>
                </Pressable>
              ))}
              <Text variant="small" muted>
                Strength out of 100, and how often each was done in this range.
              </Text>
            </Section>
          </View>
          <View style={[styles.column, wide && styles.columnWide]}>
            <Section title="Identity score, last 30 days">
              {view.identity.map((score) => (
                <View key={score.identityId} style={styles.rank}>
                  <View style={[styles.dot, { backgroundColor: identityColor(score.colourToken).accent }]} />
                  <Text style={styles.rankName}>{score.name}</Text>
                  <Text numeric>{score.label}</Text>
                </View>
              ))}
            </Section>
            <Section title="Habits that go together">
              {view.pairs.length ? (
                view.pairs.map((line) => <Text key={line}>{line}</Text>)
              ) : (
                <Text variant="small" muted>
                  After about 3 weeks of two habits being due on the same days, the ones that go together show up here.
                </Text>
              )}
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
      {detail && view ? (
        <HabitDetailScreen
          habitId={detail.id}
          title={detail.title}
          identityName={detail.identity_name}
          today={view.today}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            onEditHabit?.(detail.id);
          }}
        />
      ) : null}
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
  controls: { gap: space.sm },
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
  rank: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.minTouchTarget },
  rankName: { flex: 1 },
  rankStrength: { width: 32, textAlign: 'right' },
  dot: { width: space.md, height: space.md, borderRadius: radius.full },
});
