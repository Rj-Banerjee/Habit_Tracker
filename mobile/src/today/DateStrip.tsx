import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { layout, space, StripDay, weekOf } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

interface DateStripProps {
  // Monday to Sunday, oldest first.
  weeks: StripDay[][];
  onSelect: (day: string) => void;
  // Days with something still open, such as yesterday before its window closes.
  marked?: string[];
}

const CIRCLE = 40;

// A week at a time: swipe right for the week before, left for the week after. It opens on
// the week holding the chosen day.
export function DateStrip({ weeks, onSelect, marked = [] }: DateStripProps) {
  const { colors, theme } = useTheme();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const selected = weeks.flat().find((d) => d.selected)?.day ?? '';
  const page = weekOf(weeks, selected);

  // To the chosen day's week whenever it, or the width, changes.
  useEffect(() => {
    if (width > 0) scroll.current?.scrollTo({ x: page * width, animated: false });
  }, [page, width]);

  const measure = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  return (
    <ScrollView
      ref={scroll}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onLayout={measure}
      contentOffset={{ x: page * width, y: 0 }}
      accessibilityRole="tablist"
      testID="date-strip"
    >
      {weeks.map((week) => (
        <View key={week[0].day} style={[styles.week, { width }]} testID={`week-${week[0].day}`}>
          {week.map((d) => {
            const label = new Intl.DateTimeFormat('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${d.day}T00:00:00Z`));
            const dot = d.selected || marked.includes(d.day);
            return (
              <Pressable
                key={d.day}
                onPress={() => onSelect(d.day)}
                disabled={!d.inReach}
                accessibilityRole="tab"
                accessibilityLabel={d.isToday ? `Today, ${label}` : label}
                accessibilityState={{ selected: d.selected, disabled: !d.inReach }}
                style={[styles.item, !d.inReach && styles.outOfReach]}
                testID={`day-${d.day}`}
              >
                <Text variant="small" muted style={styles.weekday}>
                  {d.weekday}
                </Text>
                <View
                  style={[
                    styles.circle,
                    d.selected && { backgroundColor: colors.surfaceSunken },
                    d.isToday && !d.selected && { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <Text
                    numeric
                    muted={!d.selected}
                    style={[styles.date, { fontFamily: theme.typography.fonts.semiBold }]}
                  >
                    {d.date}
                  </Text>
                </View>
                <View style={[styles.dot, dot && { backgroundColor: d.selected ? colors.text : colors.textMuted }]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', paddingVertical: space.sm },
  item: { flex: 1, minWidth: layout.minTouchTarget, alignItems: 'center', gap: space.xs },
  outOfReach: { opacity: 0.35 },
  weekday: { letterSpacing: 0.5 },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
  date: { fontSize: 17, lineHeight: 22 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
