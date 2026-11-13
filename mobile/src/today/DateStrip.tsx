import React, { useRef } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { layout, space, StripDay } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

interface DateStripProps {
  days: StripDay[];
  onSelect: (day: string) => void;
  // Days with something still open, such as yesterday before its window closes.
  marked?: string[];
}

const CIRCLE = 40;
const ITEM = Math.max(layout.minTouchTarget, 48);
const GAP = space.sm;

// A week either side of today, scrolled so the chosen day sits in the middle.
export function DateStrip({ days, onSelect, marked = [] }: DateStripProps) {
  const { colors, theme } = useTheme();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const centred = useRef(false);
  const selected = Math.max(0, days.findIndex((d) => d.selected));

  const centre = (event: LayoutChangeEvent) => {
    if (centred.current) return;
    centred.current = true;
    const width = event.nativeEvent.layout.width;
    const x = selected * (ITEM + GAP) - (width - ITEM) / 2;
    scroll.current?.scrollTo({ x: Math.max(0, x), animated: false });
  };

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={ITEM + GAP}
      decelerationRate="fast"
      onLayout={centre}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {days.map((d) => {
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
            accessibilityRole="tab"
            accessibilityLabel={d.isToday ? `Today, ${label}` : label}
            accessibilityState={{ selected: d.selected }}
            style={styles.item}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: GAP, paddingVertical: space.sm },
  item: { width: ITEM, alignItems: 'center', gap: space.xs },
  weekday: { letterSpacing: 0.5 },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
  date: { fontSize: 17, lineHeight: 22 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
