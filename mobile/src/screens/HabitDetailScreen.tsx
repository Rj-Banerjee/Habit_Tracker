import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AnalyticsHabit,
  AnalyticsRange,
  buildWeekChain,
  Chain,
  chainRows,
  consistencyStats,
  forHabit,
  habitChain,
  headlineStats,
  heatmap,
  isWeeklyHabit,
  layout,
  progressHabitOf,
  RANGE_LABELS,
  rangeDates,
  RepairHabit,
  repairHint,
  seamLabel,
  skipReasonLines,
  space,
  strengthInRange,
  streakHistory,
  timing,
  timingStats,
  volumeStats,
  weekBars,
  weekdayHourGrid,
  weekRepairHint,
  withinRange,
} from '@habit-tracker/core';
import { Button, SegmentedControl, StreakChain, Text, useShortcut, useTheme } from '@habit-tracker/ui';
import { DayBars } from '../analytics/DayBars';
import { InsightCards } from '../analytics/InsightCards';
import { HourHeatmap } from '../analytics/HourHeatmap';
import { StatGrid } from '../analytics/StatGrid';
import { StrengthLine } from '../analytics/StrengthLine';
import { WeekdayRates } from '../analytics/WeekdayRates';
import { useHabitAnalytics } from '../hooks/useHabitAnalytics';
import { Forecaster } from '../progress/Forecaster';
import { Heatmap } from '../progress/Heatmap';
import { StreakHistory } from '../progress/StreakHistory';

const SHOWN_DAYS = 30;
const SHOWN_WEEKS = 12;
const PER_ROW = 10;
const RANGES: AnalyticsRange[] = ['7d', '30d', '90d', '1y', 'all'];

interface HabitDetailScreenProps {
  habitId: string;
  // Shown at once, before the numbers load.
  title: string;
  identityName: string;
  today: string;
  onClose: () => void;
  onEdit: () => void;
}

const repairHabitOf = (habit: AnalyticsHabit): RepairHabit => ({
  title: habit.title,
  type: habit.type,
  target: habit.target,
  unit: habit.unit,
});

const seamLabelsFor = (chain: Chain, habit: RepairHabit) =>
  Object.fromEntries(
    chain.links.flatMap((kind, i) =>
      kind === 'seam' ? [[i + 1, seamLabel(chain.nodes[i + 1], habit, chain.unit)]] : []
    )
  );

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="small" muted accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function HabitDetailScreen({ habitId, title, identityName, today, onClose, onEdit }: HabitDetailScreenProps) {
  const { colors, identity } = useTheme();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  // Bumped after an insight's action, so the numbers show the change.
  const [reload, setReload] = useState(0);
  const { loaded, failed, loading } = useHabitAnalytics(habitId, today, range === 'all', reload);
  useShortcut('Escape', onClose);

  const view = useMemo(() => {
    const habit = loaded?.data.habits.find((h) => h.id === habitId);
    if (!loaded || !habit) return null;
    // Everything loaded, for strength and the year heatmap; and just the chosen range.
    const all = forHabit(loaded.data, habitId);
    const { from, to } = rangeDates(range, today, habit.starts_on);
    const ranged = withinRange(all, from, to);
    const weekly = isWeeklyHabit(habit);
    const repair = repairHabitOf(habit);
    const chain = weekly
      ? buildWeekChain(habitId, loaded.weeks, SHOWN_WEEKS)
      : habitChain(habitId, all.days, today, SHOWN_DAYS, loaded.statuses);
    return {
      habit,
      weekly,
      repair,
      accent: identity(habit.colour_token).accent,
      headline: headlineStats(habit, ranged, all),
      strength: strengthInRange(habit, all, ranged.from),
      bars: weekBars(ranged),
      consistency: consistencyStats(habit, ranged),
      skipReasons: skipReasonLines(habit, ranged),
      volume: volumeStats(habit, ranged),
      timing: timingStats(habit, ranged),
      byWeekday: timing(ranged, [habitId]).byWeekday,
      hours: weekdayHourGrid(ranged, habitId),
      year: heatmap(all.days, habitId, today),
      chain,
      runs: weekly ? [] : streakHistory(all.days, habitId),
      crack: [...chain.nodes].reverse().find((node) => node.status === 'missed' && node.repairOn),
      days: all.days,
    };
  }, [loaded, habitId, range, today, identity]);

  return (
    <SafeAreaView edges={['top']} style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.back}>
          <Button label="Back" quiet onPress={onClose} />
        </View>
        <View style={styles.header}>
          <Text variant="small" muted>
            {identityName}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
        </View>

        <SegmentedControl
          options={RANGES.map((value) => ({ value, label: RANGE_LABELS[value] }))}
          value={range}
          onChange={setRange}
        />

        {loaded && !view ? (
          <Text variant="small" muted>
            There are no numbers for this habit yet.
          </Text>
        ) : failed && !view ? (
          <Text variant="small" muted>
            The numbers couldn&apos;t load. Check the connection and open this again.
          </Text>
        ) : !view ? (
          <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading the numbers" />
        ) : (
          <>
            {loading && range === 'all' ? (
              <Text variant="small" muted>
                Loading all time…
              </Text>
            ) : null}
            <StatGrid stats={view.headline} />

            <Section title="Insights">
              <InsightCards
                habitId={habitId}
                titles={{ [habitId]: title }}
                onChanged={() => setReload((count) => count + 1)}
              />
            </Section>

            <Section title="Strength">
              <StrengthLine points={view.strength} accent={view.accent} weekly={view.weekly} />
            </Section>

            <Section title="Day by day">
              <DayBars weeks={view.bars} donutColor={view.accent} />
            </Section>

            <Section title="Consistency">
              <StatGrid stats={view.consistency} />
              {view.skipReasons.length ? (
                <View style={styles.lines}>
                  <Text variant="small" muted>
                    Skipped mostly for
                  </Text>
                  {view.skipReasons.map((line) => (
                    <Text key={line} numeric>
                      {line}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Section>

            {view.volume ? (
              <Section title="Amounts">
                <StatGrid stats={view.volume} />
                <Forecaster habit={progressHabitOf(view.habit)} days={view.days} today={today} />
              </Section>
            ) : null}

            <Section title="When it gets done">
              {view.weekly ? null : <WeekdayRates byWeekday={view.byWeekday} accent={view.accent} />}
              <HourHeatmap grid={view.hours} accent={view.accent} />
              {view.timing.length ? <StatGrid stats={view.timing} /> : null}
            </Section>

            <Section title="The last year">
              <Heatmap data={view.year} identity={view.habit.colour_token} />
            </Section>

            <Section title={view.weekly ? `The last ${SHOWN_WEEKS} weeks` : `The last ${SHOWN_DAYS} scheduled days`}>
              {chainRows(view.chain, PER_ROW).map((part) => (
                <View key={part.nodes[0]?.date ?? 'empty'} style={styles.chainRow}>
                  <StreakChain
                    chain={part}
                    identity={view.habit.colour_token}
                    seamLabels={seamLabelsFor(part, view.repair)}
                  />
                </View>
              ))}
              {view.crack?.repairOn ? (
                <Text variant="small" numeric>
                  {view.weekly ? weekRepairHint(view.habit.per_week ?? 1) : repairHint(view.repair, view.crack.repairOn)}
                </Text>
              ) : null}
              {view.weekly ? null : <StreakHistory runs={view.runs} />}
            </Section>
          </>
        )}

        <Button label="Edit habit" quiet onPress={onEdit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.xl,
    width: '100%',
    maxWidth: layout.readingWidth,
    alignSelf: 'center',
    padding: space.lg,
  },
  back: { alignSelf: 'flex-start' },
  header: { gap: space.xs },
  section: { gap: space.md },
  lines: { gap: space.xs },
  chainRow: { paddingVertical: space.sm },
});
