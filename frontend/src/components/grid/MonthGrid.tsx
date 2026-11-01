'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import {
  canChangeDay,
  dayName,
  dayNumber,
  groupHabits,
  layout,
  monthDates,
  monthLabel,
  scrollEdges,
  shiftMonth,
  space,
} from '@habit-tracker/core';
import { Button, FormMessage, HabitCard, Text, useLayoutSize, useShortcut, useTheme } from '@habit-tracker/ui';
import { useHabitRange } from '../../hooks/useHabitRange';
import { useToday } from '../../hooks/useToday';
import { DayActionsSheet, DayTarget } from './DayActionsSheet';
import { DayCell } from './DayCell';

const NAME_WIDTH = 200;
const STREAK_WIDTH = 72;
const MOUSE_CELL = 36;

// Touch screens get the full 48px target. A mouse can aim at a tighter grid.
function useCellSize() {
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  return coarse ? layout.minTouchTarget : MOUSE_CELL;
}

export function MonthGrid() {
  const { today, failed } = useToday();
  const start = today ?? '2000-01-01';
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const current = view ?? { year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) };
  const dates = useMemo(() => monthDates(current.year, current.month), [current.year, current.month]);

  const range = useHabitRange(dates[0], dates[dates.length - 1], today);
  const { colors } = useTheme();
  const size = useLayoutSize();
  const cell = useCellSize();
  const [target, setTarget] = useState<DayTarget | null>(null);
  const days = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const metrics = useRef({ offset: 0, view: 0, content: 0 });
  const [edges, setEdges] = useState({ before: false, after: false });

  const measure = (patch: Partial<typeof metrics.current>) => {
    metrics.current = { ...metrics.current, ...patch };
    const { offset, view, content } = metrics.current;
    setEdges(scrollEdges(offset, view, content));
  };

  const page = (direction: 1 | -1) => {
    const { offset, view } = metrics.current;
    days.current?.scrollTo({ x: Math.max(0, offset + direction * view * 0.8), animated: true });
  };

  const step = (delta: number) => setView(shiftMonth(current.year, current.month, delta));
  useShortcut('[', () => step(-1));
  useShortcut(']', () => step(1));
  useShortcut('t', () => setView(null));

  const todayIndex = today ? dates.indexOf(today) : -1;

  useEffect(() => {
    if (todayIndex >= 0) {
      days.current?.scrollTo({ x: Math.max(0, (todayIndex - 6) * cell), animated: false });
    }
  }, [todayIndex, cell, range.loading]);

  if (failed || range.loadFailed) {
    return (
      <View style={styles.notice}>
        <Text>Your habits couldn&apos;t load.</Text>
        <Button label="Try again" onPress={range.refresh} />
      </View>
    );
  }

  if (!today || range.loading) {
    return <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading your habits" />;
  }

  const tap = (target: DayTarget) => {
    const status = range.statusOf(target.habit.id, target.date);
    if (status === 'done' || status === 'doneMinimum') {
      range.undo(target.habit.id, target.date);
    } else {
      range.log(target.habit.id, target.date);
    }
  };

  const targetFor = (habit: DayTarget['habit'], date: string): DayTarget => {
    const status = range.statusOf(habit.id, date);
    return {
      habit,
      date,
      logged: status === 'done' || status === 'doneMinimum',
      repairOn: range.repairOn(habit.id, date),
    };
  };

  const groups = groupHabits(range.habits);

  return (
    <View style={styles.page}>
      <View style={styles.toolbar}>
        <View style={styles.month}>
          <Button quiet label="‹" onPress={() => step(-1)} accessibilityLabel="Previous month" />
          <Text variant="title" numeric>
            {monthLabel(current.year, current.month)}
          </Text>
          <Button quiet label="›" onPress={() => step(1)} accessibilityLabel="Next month" />
        </View>
        {view ? <Button quiet label="This month" onPress={() => setView(null)} /> : null}
      </View>

      <FormMessage message={range.message} />

      {groups.length === 0 ? (
        <View style={styles.notice}>
          <Text>No habits yet.</Text>
          <Text variant="small" muted>
            Habits you add in the app will show up here.
          </Text>
        </View>
      ) : size === 'compact' ? (
        <View style={styles.compact}>
          <Text variant="small" muted>
            The grid needs a wider window. Here&apos;s today.
          </Text>
          {groups.flatMap((group) =>
            group.habits.map((habit) => (
              <HabitCard
                key={habit.id}
                title={habit.title}
                status={range.statusOf(habit.id, today) ?? 'open'}
                identity={group.colour}
                streak={range.streaks[habit.id]}
                onPress={() => tap(targetFor(habit, today))}
                onLongPress={() => setTarget(targetFor(habit, today))}
              />
            ))
          )}
        </View>
      ) : (
        <View style={styles.tableArea}>
          {edges.before || edges.after ? (
            <View style={styles.pager}>
              {edges.before ? <Button quiet label="‹ Earlier days" onPress={() => page(-1)} /> : null}
              {edges.after ? <Button quiet label="Later days ›" onPress={() => page(1)} /> : null}
            </View>
          ) : null}
          <View style={styles.table}>
          <View style={{ width: NAME_WIDTH }}>
            <View style={[styles.headerRow, { height: 44 }]} />
            {groups.map((group) => (
              <View key={group.identityId}>
                <View style={[styles.groupRow]}>
                  <Text variant="small" muted accessibilityRole="header" numberOfLines={1}>
                    {group.name}
                  </Text>
                </View>
                {group.habits.map((habit) => (
                  <View key={habit.id} style={[styles.nameRow, { height: cell }]}>
                    <Text numberOfLines={1}>{habit.title}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          <ScrollView
            horizontal
            ref={days}
            style={styles.days}
            scrollEventThrottle={100}
            onLayout={(event) => measure({ view: event.nativeEvent.layout.width })}
            onContentSizeChange={(width) => measure({ content: width })}
            onScroll={(event) => measure({ offset: event.nativeEvent.contentOffset.x })}
          >
            <View>
              <View style={[styles.headerRow, { height: 44 }]}>
                {dates.map((date) => (
                  <View key={date} style={[styles.dayHead, { width: cell }]}>
                    <Text variant="small" muted>
                      {dayName(date).charAt(0)}
                    </Text>
                    <Text
                      variant="small"
                      numeric
                      muted={date !== today}
                      style={date === today ? styles.todayNumber : undefined}
                    >
                      {dayNumber(date)}
                    </Text>
                  </View>
                ))}
              </View>
              {groups.map((group) => (
                <View key={group.identityId}>
                  <View style={styles.groupRow} />
                  {group.habits.map((habit) => (
                    <View key={habit.id} style={styles.cells}>
                      {dates.map((date) => (
                        <DayCell
                          key={date}
                          title={habit.title}
                          date={date}
                          size={cell}
                          status={range.statusOf(habit.id, date)}
                          identity={group.colour}
                          isToday={date === today}
                          repairOn={range.repairOn(habit.id, date)}
                          editable={canChangeDay(date, today)}
                          onPress={() => tap(targetFor(habit, date))}
                          onActions={() => setTarget(targetFor(habit, date))}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={{ width: STREAK_WIDTH }}>
            <View style={[styles.headerRow, styles.streakHead, { height: 44 }]}>
              <Text variant="small" muted>
                Streak
              </Text>
            </View>
            {groups.map((group) => (
              <View key={group.identityId}>
                <View style={styles.groupRow} />
                {group.habits.map((habit) => (
                  <View key={habit.id} style={[styles.streak, { height: cell }]}>
                    {range.streaks[habit.id] ? <Text numeric>{range.streaks[habit.id]}</Text> : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
          </View>
        </View>
      )}

      <Text variant="small" muted>
        Click today or yesterday to log. Right click for smaller versions or to skip. Keys: [ and ] change month, T jumps to
        this month.
      </Text>

      <DayActionsSheet
        target={target}
        onClose={() => setTarget(null)}
        onLog={(t, level) => {
          setTarget(null);
          range.log(t.habit.id, t.date, level);
        }}
        onUndo={(t) => {
          setTarget(null);
          range.undo(t.habit.id, t.date);
        }}
        onSkip={(t, reason) => {
          setTarget(null);
          range.skip(t.habit.id, t.date, reason);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  month: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  notice: { gap: space.md, maxWidth: layout.readingWidth },
  compact: { gap: space.sm },
  tableArea: { gap: space.sm },
  pager: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  table: { flexDirection: 'row' },
  days: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: space.xs },
  dayHead: { alignItems: 'center' },
  todayNumber: { fontWeight: '600' },
  groupRow: { height: 32, justifyContent: 'flex-end', paddingBottom: space.xs },
  nameRow: { justifyContent: 'center', paddingRight: space.md },
  cells: { flexDirection: 'row' },
  streakHead: { justifyContent: 'flex-end' },
  streak: { alignItems: 'flex-end', justifyContent: 'center' },
});
