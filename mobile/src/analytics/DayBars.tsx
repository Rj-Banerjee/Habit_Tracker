import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import { dayBarLabel, IdentityToken, space, weekDonutLabel, WeekBars } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

const BAR = 8;
const BAR_GAP = 2;
const WEEK_GAP = 12;
const HEIGHT = 80;
// A day that was due shows a quiet baseline, so a miss is visible without colour.
const BASELINE = 2;
// The same 2px gap between stacked segments as between bars.
const SEGMENT_GAP = 2;
const DONUT = 9;
const DONUT_STROKE = 3;
const DONUT_ROW = DONUT * 2 + space.md;
// Minimum days are the same colour, lighter: the shape of the stack says the rest.
const MINIMUM_OPACITY = 0.45;

interface DayBarsProps {
  weeks: WeekBars[];
  // The donut's colour: the habit's own on Habit detail.
  donutColor?: string;
  teaser?: string;
}

type Picked = { kind: 'day'; week: number; day: number } | { kind: 'week'; week: number } | null;

const weekWidth = (week: WeekBars) => week.days.length * (BAR + BAR_GAP) - BAR_GAP;

export function DayBars({ weeks, donutColor, teaser = 'Tap a bar or a ring for its numbers' }: DayBarsProps) {
  const { colors, identity } = useTheme();
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const tallest = Math.max(1, ...weeks.flatMap((week) => week.days.map((bar) => Math.max(bar.due, bar.done))));
  const unit = (HEIGHT - BASELINE) / tallest;
  const starts = weeks.reduce<number[]>((at, week, i) => [...at, i === 0 ? 0 : at[i - 1] + weekWidth(weeks[i - 1]) + WEEK_GAP], []);
  const width = weeks.length ? starts.at(-1)! + weekWidth(weeks.at(-1)!) : 0;
  const done = weeks.reduce((sum, week) => sum + week.done, 0);
  const due = weeks.reduce((sum, week) => sum + week.due, 0);

  if (weeks.every((week) => week.days.every((bar) => bar.due === 0 && bar.done === 0))) {
    return (
      <Text variant="small" muted>
        Each day you&apos;re due gets a bar here. Log a day to see the first one.
      </Text>
    );
  }

  const readout =
    picked?.kind === 'day'
      ? dayBarLabel(weeks[picked.week].days[picked.day])
      : picked?.kind === 'week'
        ? weekDonutLabel(weeks[picked.week])
        : teaser;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      >
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Day by day: ${done} of ${due} done over ${weeks.length} ${weeks.length === 1 ? 'week' : 'weeks'}.`}
          testID="day-bars"
        >
          <Svg width={width} height={HEIGHT + DONUT_ROW}>
            {weeks.map((week, w) => (
              <G key={week.weekStart} x={starts[w]}>
                {week.days.map((bar, d) => {
                  const x = d * (BAR + BAR_GAP);
                  let top = HEIGHT;
                  const segments = bar.stacks.flatMap((stack) => {
                    const accent = identity(stack.colourToken as IdentityToken).accent;
                    return [
                      { key: `${stack.identityId}-full`, count: stack.full, fill: accent, opacity: 1 },
                      { key: `${stack.identityId}-min`, count: stack.minimum, fill: accent, opacity: MINIMUM_OPACITY },
                    ].filter((segment) => segment.count > 0);
                  });
                  const isPicked = picked?.kind === 'day' && picked.week === w && picked.day === d;
                  return (
                    <G key={bar.date} onPress={() => setPicked({ kind: 'day', week: w, day: d })}>
                      {/* The whole column answers a tap, not just the bar. */}
                      <Rect x={x - BAR_GAP / 2} y={0} width={BAR + BAR_GAP} height={HEIGHT} fill="transparent" />
                      {bar.due > 0 && bar.done === 0 ? (
                        <Rect x={x} y={HEIGHT - BASELINE} width={BAR} height={BASELINE} rx={1} fill={colors.hollow} />
                      ) : null}
                      {segments.map((segment, i) => {
                        const height = Math.max(2, segment.count * unit - (i > 0 ? SEGMENT_GAP : 0));
                        top -= height + (i > 0 ? SEGMENT_GAP : 0);
                        return (
                          <Rect
                            key={segment.key}
                            x={x}
                            y={top}
                            width={BAR}
                            height={height}
                            rx={i === segments.length - 1 ? 3 : 1}
                            fill={segment.fill}
                            fillOpacity={segment.opacity}
                          />
                        );
                      })}
                      {isPicked ? (
                        <Rect x={x - 1} y={0} width={BAR + 2} height={HEIGHT} fill="none" stroke={colors.textMuted} strokeWidth={1} rx={2} />
                      ) : null}
                    </G>
                  );
                })}
                <WeekDonut
                  week={week}
                  cx={weekWidth(week) / 2}
                  cy={HEIGHT + space.md / 2 + DONUT}
                  color={donutColor ?? colors.text}
                  track={colors.surfaceSunken}
                  onPress={() => setPicked({ kind: 'week', week: w })}
                />
              </G>
            ))}
          </Svg>
        </View>
      </ScrollView>
      <Text variant="small" muted numeric accessibilityLiveRegion="polite">
        {readout}
      </Text>
    </View>
  );
}

interface WeekDonutProps {
  week: WeekBars;
  cx: number;
  cy: number;
  color: string;
  track: string;
  onPress: () => void;
}

function WeekDonut({ week, cx, cy, color, track, onPress }: WeekDonutProps) {
  const circumference = 2 * Math.PI * DONUT;
  const share = week.due > 0 ? Math.min(1, week.done / week.due) : 0;
  return (
    <G onPress={onPress}>
      <Circle cx={cx} cy={cy} r={DONUT + 6} fill="transparent" />
      <Circle cx={cx} cy={cy} r={DONUT} fill="none" stroke={track} strokeWidth={DONUT_STROKE} />
      {share > 0 ? (
        <Circle
          cx={cx}
          cy={cy}
          r={DONUT}
          fill="none"
          stroke={color}
          strokeWidth={DONUT_STROKE}
          strokeDasharray={`${circumference * share} ${circumference}`}
          strokeLinecap={share < 1 ? 'round' : 'butt'}
          // Starts at the top and goes clockwise.
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ) : null}
    </G>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
});
