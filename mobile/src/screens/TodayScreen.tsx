import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  cardDetail,
  cardStatus,
  dayPart,
  eveningNote,
  greeting,
  groupByIdentity,
  HabitLevel,
  isLogged,
  layout,
  progressLabel,
  repairOnLabel,
  RepairRow,
  showYesterdayFirst,
  space,
  TodayRow,
} from '@habit-tracker/core';
import {
  Button,
  HabitCard,
  SkipSheet,
  Text,
  useLayoutSize,
  useShortcut,
  useTheme,
} from '@habit-tracker/ui';
import { useToday } from '../hooks/useToday';
import { checkOffTick } from '../services/haptics';
import { ShrinkSheet } from '../today/ShrinkSheet';
import { SwipeToSkip } from '../today/SwipeToSkip';

export function TodayScreen() {
  const { colors } = useTheme();
  const { rows, repairs, loading, loadFailed, message, refresh, log, undo, skip, repair } =
    useToday();
  const size = useLayoutSize();
  const [shrinkRow, setShrinkRow] = useState<TodayRow | null>(null);
  const [skipRow, setSkipRow] = useState<TodayRow | null>(null);

  const part = dayPart(new Date().getHours());
  const today = rows.filter((row) => row.is_today);
  const yesterday = rows.filter((row) => !row.is_today);

  const refreshNow = useCallback(() => {
    refresh();
  }, [refresh]);

  const tap = (row: TodayRow) => (isLogged(row) ? undo(row) : log(row, 'full'));

  const renderCard = (row: TodayRow) => (
    <SwipeToSkip
      key={`${row.habit_id}-${row.day}`}
      enabled={!isLogged(row)}
      onSkip={() => setSkipRow(row)}
    >
      <HabitCard
        title={row.title}
        status={cardStatus(row)}
        identity={row.colour_token}
        streak={row.current_streak}
        detail={cardDetail(row)}
        onPress={() => tap(row)}
        onLongPress={() => setShrinkRow(row)}
        onSkip={() => setSkipRow(row)}
        onCheckOff={checkOffTick}
      />
    </SwipeToSkip>
  );

  useShortcut('r', refreshNow);

  const repairSection =
    repairs.length > 0 ? (
      <View style={styles.group}>
        <Text variant="small" muted accessibilityRole="header">
          Can still be repaired
        </Text>
        {repairs.map((row: RepairRow) => (
          <HabitCard
            key={row.habit_id}
            title={row.title}
            status="missed"
            statusLabel={repairOnLabel(row.repair_on)}
            identity={row.colour_token}
            streak={row.current_streak}
          />
        ))}
      </View>
    ) : null;

  const yesterdaySection =
    yesterday.length > 0 ? (
      <View style={styles.group}>
        <Text variant="small" muted accessibilityRole="header">
          Still open from yesterday
        </Text>
        {yesterday.map(renderCard)}
      </View>
    ) : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={[styles.content, size !== 'compact' && styles.contentWide]}>
        <View style={styles.header}>
          <Text variant="small" muted>
            {greeting(part)}
          </Text>
          <Text variant="title" accessibilityRole="header" numeric>
            {progressLabel(today) || 'Today'}
          </Text>
          {part === 'evening' && eveningNote(today) ? (
            <Text variant="small" muted numeric>
              {eveningNote(today)}
            </Text>
          ) : null}
        </View>

        {message ? (
          <Text variant="small" muted accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading your habits" />
        ) : loadFailed ? (
          <View style={styles.notice}>
            <Text>Your habits couldn&apos;t load.</Text>
            <Button label="Try again" onPress={refresh} />
          </View>
        ) : rows.length === 0 && repairs.length === 0 ? (
          <View style={styles.notice}>
            <Text>Nothing is due today.</Text>
            <Text variant="small" muted>
              Habits you add will show up here on the days they&apos;re scheduled.
            </Text>
          </View>
        ) : (
          <>
            {showYesterdayFirst(part) ? yesterdaySection : null}
            {groupByIdentity(today).map((group) => (
              <View key={group.identityId} style={styles.group}>
                <Text variant="small" muted accessibilityRole="header">
                  {group.name}
                </Text>
                {group.rows.map(renderCard)}
              </View>
            ))}
            {showYesterdayFirst(part) ? null : yesterdaySection}
            {repairSection}
          </>
        )}
      </ScrollView>

      <ShrinkSheet
        row={shrinkRow}
        onClose={() => setShrinkRow(null)}
        onLog={(row: TodayRow, level: HabitLevel) => {
          setShrinkRow(null);
          log(row, level);
        }}
        onRepair={(row) => {
          setShrinkRow(null);
          repair(row);
        }}
        onSkip={(row) => {
          setShrinkRow(null);
          setSkipRow(row);
        }}
      />
      <SkipSheet
        visible={skipRow !== null}
        onClose={() => setSkipRow(null)}
        onSkip={(reason) => {
          if (skipRow) skip(skipRow, reason);
          setSkipRow(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    gap: space.xl,
    width: '100%',
    maxWidth: layout.readingWidth,
    alignSelf: 'center',
    padding: space.lg,
  },
  contentWide: { paddingTop: space.xxl },
  header: { gap: space.xs, paddingTop: space.lg },
  group: { gap: space.sm },
  notice: { gap: space.md },
});
