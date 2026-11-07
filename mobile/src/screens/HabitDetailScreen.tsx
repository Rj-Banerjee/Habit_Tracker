import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addDays,
  buildWeekChain,
  Chain,
  chainRows,
  DayStatus,
  habitChain,
  isWeekly,
  layout,
  longestWeekRun,
  ProgressDay,
  repairHint,
  seamLabel,
  space,
  streakHistory,
  TodayRow,
  WeekStatusRow,
  weekRepairHint,
} from '@habit-tracker/core';
import { Button, StreakChain, Text, useShortcut, useTheme } from '@habit-tracker/ui';
import { repairHabitOf } from '../chain/CardChain';
import { tracker } from '../services/tracker';

const SHOWN_DAYS = 30;
const SHOWN_WEEKS = 12;
const PER_ROW = 10;
// Far enough back for 30 scheduled days on most schedules, and for the longest streak.
const LOOKBACK_DAYS = 120;

interface HabitDetailScreenProps {
  row: TodayRow;
  onClose: () => void;
  onEdit: () => void;
}

const seamLabelsFor = (chain: Chain, row: TodayRow) =>
  Object.fromEntries(
    chain.links.flatMap((kind, i) =>
      kind === 'seam' ? [[i + 1, seamLabel(chain.nodes[i + 1], repairHabitOf(row), chain.unit)]] : []
    )
  );

export function HabitDetailScreen({ row, onClose, onEdit }: HabitDetailScreenProps) {
  const { colors } = useTheme();
  const [data, setData] = useState<{ days: ProgressDay[]; statuses: DayStatus[]; weeks: WeekStatusRow[] } | null>(
    null
  );
  // A times-per-week habit is shown, and its streak counted, in weeks.
  const weekly = isWeekly(row);
  const [failed, setFailed] = useState(false);
  const today = row.day;
  useShortcut('Escape', onClose);

  useEffect(() => {
    const from = addDays(today, -LOOKBACK_DAYS);
    Promise.all([
      tracker.getHabitDays(from, today),
      tracker.getDayStatuses(from, today),
      weekly ? tracker.getWeekStatuses(from, today) : [],
    ])
      .then(([days, statuses, weeks]) => setData({ days, statuses, weeks }))
      .catch(() => setFailed(true));
  }, [today, weekly]);

  const chain = useMemo(() => {
    if (!data) return null;
    return weekly
      ? buildWeekChain(row.habit_id, data.weeks, SHOWN_WEEKS)
      : habitChain(row.habit_id, data.days, today, SHOWN_DAYS, data.statuses);
  }, [data, row.habit_id, today, weekly]);
  const longest = useMemo(() => {
    if (!data) return 0;
    if (weekly) return longestWeekRun(row.habit_id, data.weeks);
    return Math.max(0, ...streakHistory(data.days, row.habit_id).map((run) => run.length));
  }, [data, row.habit_id, weekly]);
  const crack = [...(chain?.nodes ?? [])].reverse().find((node) => node.status === 'missed' && node.repairOn);

  return (
    <SafeAreaView edges={['top']} style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.back}>
          <Button label="Back" quiet onPress={onClose} />
        </View>
        <View style={styles.header}>
          <Text variant="small" muted>
            {row.identity_name}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {row.title}
          </Text>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text variant="title" numeric>
              {row.current_streak}
            </Text>
            <Text variant="small" muted>
              {weekly ? 'week streak' : 'day streak'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="title" numeric>
              {Math.max(longest, row.current_streak)}
            </Text>
            <Text variant="small" muted>
              longest
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="small" muted accessibilityRole="header">
            {weekly ? `The last ${SHOWN_WEEKS} weeks` : `The last ${SHOWN_DAYS} scheduled days`}
          </Text>
          {failed ? (
            <Text variant="small" muted>
              The streak couldn&apos;t load.
            </Text>
          ) : !chain ? (
            <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading the streak" />
          ) : (
            chainRows(chain, PER_ROW).map((part) => (
              <View key={part.nodes[0]?.date ?? 'empty'} style={styles.chainRow}>
                <StreakChain chain={part} identity={row.colour_token} seamLabels={seamLabelsFor(part, row)} />
              </View>
            ))
          )}
          {crack?.repairOn ? (
            <Text variant="small" numeric>
              {weekly ? weekRepairHint(row.week_quota ?? 1) : repairHint(repairHabitOf(row), crack.repairOn)}
            </Text>
          ) : null}
        </View>

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
  stats: { flexDirection: 'row', gap: space.xxl },
  stat: { gap: 2 },
  section: { gap: space.md },
  chainRow: { paddingVertical: space.sm },
});
