import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { layout, space, TIME_FILTERS, TimeFilter, timeFilterLabel } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

type ViewRef = React.ComponentRef<typeof View>;

export const CHIP_FADE_MS = 300;
const ICON = 16;

// Where each chip is on screen, so a dragged card can be dropped on one.
export interface ChipRect {
  filter: TimeFilter;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimeChipsHandle {
  measure: () => Promise<ChipRect[]>;
}

interface TimeChipsProps {
  active: TimeFilter;
  onChange: (filter: TimeFilter) => void;
  // While a card is dragged over a chip, that chip lights up as the place it would go.
  target?: TimeFilter | null;
  reducedMotion?: boolean;
}

function TimeIcon({ filter, color }: { filter: TimeFilter; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, fill: 'none' };
  if (filter === 'all') return null;
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 16 16" accessible={false}>
      {filter === 'morning' ? (
        // A sun rising over the horizon.
        <>
          <Path d="M3.5 11a4.5 4.5 0 0 1 9 0" {...stroke} />
          <Line x1="1.5" y1="13.5" x2="14.5" y2="13.5" {...stroke} />
          <Line x1="8" y1="2" x2="8" y2="4" {...stroke} />
          <Line x1="2.9" y1="5.4" x2="4.2" y2="6.6" {...stroke} />
          <Line x1="13.1" y1="5.4" x2="11.8" y2="6.6" {...stroke} />
        </>
      ) : filter === 'afternoon' ? (
        // The sun with its rays.
        <>
          <Circle cx="8" cy="8" r="3" {...stroke} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
            const r = (deg * Math.PI) / 180;
            return (
              <Line
                key={deg}
                x1={8 + Math.cos(r) * 5.2}
                y1={8 + Math.sin(r) * 5.2}
                x2={8 + Math.cos(r) * 6.8}
                y2={8 + Math.sin(r) * 6.8}
                {...stroke}
              />
            );
          })}
        </>
      ) : (
        // A crescent moon.
        <Path d="M12.5 10.2A5.2 5.2 0 0 1 5.8 3.5a5.2 5.2 0 1 0 6.7 6.7z" {...stroke} />
      )}
    </Svg>
  );
}

function Chip({
  filter,
  on,
  lit,
  reducedMotion,
  onPress,
  chipRef,
}: {
  filter: TimeFilter;
  on: boolean;
  lit: boolean;
  reducedMotion: boolean;
  onPress: () => void;
  chipRef: (view: ViewRef | null) => void;
}) {
  const { colors, radii, theme } = useTheme();
  const fill = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    fill.value = reducedMotion
      ? on ? 1 : 0
      : withTiming(on ? 1 : 0, { duration: CHIP_FADE_MS, easing: Easing.out(Easing.cubic) });
  }, [on, reducedMotion, fill]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  // The app's own "selected" look, as on every other chip: the text colour as the fill.
  const ink = on ? colors.surface : lit ? colors.text : colors.textMuted;
  const name = timeFilterLabel(filter);

  return (
    <Pressable
      ref={chipRef}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={filter === 'all' ? 'All habits' : `${name.charAt(0)}${name.slice(1).toLowerCase()} habits`}
      accessibilityState={{ selected: on }}
      style={[
        styles.chip,
        {
          borderRadius: radii.full,
          backgroundColor: lit && !on ? colors.surfaceSunken : colors.surface,
          borderColor: lit ? colors.text : colors.border,
        },
        on && styles.raised,
        on && { shadowColor: colors.text },
      ]}
      testID={`chip-${filter}`}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.text, borderRadius: radii.full }, fillStyle]}
      />
      <TimeIcon filter={filter} color={ink} />
      <Text
        variant="small"
        style={[styles.label, { color: ink, fontFamily: theme.typography.fonts[on ? 'semiBold' : 'medium'] }]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

// ALL, MORNING, AFTERNOON, EVENING: which part of the day the list shows.
export const TimeChips = forwardRef<TimeChipsHandle, TimeChipsProps>(function TimeChips(
  { active, onChange, target = null, reducedMotion = false },
  ref
) {
  const views = useRef(new Map<TimeFilter, ViewRef>());

  useImperativeHandle(ref, () => ({
    measure: () =>
      Promise.all(
        TIME_FILTERS.map(
          (filter) =>
            new Promise<ChipRect | null>((resolve) => {
              const view = views.current.get(filter);
              if (!view?.measureInWindow) return resolve(null);
              view.measureInWindow((x: number, y: number, width: number, height: number) => resolve({ filter, x, y, width, height }));
            })
        )
      ).then((rects) => rects.filter((r): r is ChipRect => r !== null)),
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {TIME_FILTERS.map((filter) => (
        <Chip
          key={filter}
          filter={filter}
          on={filter === active}
          lit={filter === target}
          reducedMotion={reducedMotion}
          onPress={() => onChange(filter)}
          chipRef={(view) => {
            if (view) views.current.set(filter, view);
            else views.current.delete(filter);
          }}
        />
      ))}
    </ScrollView>
  );
});

// Which chip, if any, is under the finger.
export const chipAt = (rects: ChipRect[], x: number, y: number): TimeFilter | null =>
  rects.find((r) => x >= r.x && x <= r.x + r.width && y >= r.y - space.sm && y <= r.y + r.height + space.sm)
    ?.filter ?? null;

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: space.xs },
  chip: {
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg + space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
  },
  raised: { shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  label: { letterSpacing: 0.5 },
});
