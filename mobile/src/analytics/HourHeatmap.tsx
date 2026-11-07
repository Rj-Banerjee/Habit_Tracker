import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { HourGrid, hourLabel, space } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG_DAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const LABEL = 30;
const HOURS_ROW = 14;
const GAP = 2;
// Fewer logs than this and a "best time" would be noise.
export const HOUR_GRID_MIN = 5;
// Even one log is clearly there; the most-used hour is full strength.
const FLOOR = 0.2;

interface HourHeatmapProps {
  grid: HourGrid;
  accent: string;
}

function busiest(grid: HourGrid) {
  let best = { day: 0, hour: 0, count: 0 };
  grid.counts.forEach((hours, day) =>
    hours.forEach((count, hour) => {
      if (count > best.count) best = { day, hour, count };
    })
  );
  return best;
}

const times = (count: number) => `${count} ${count === 1 ? 'time' : 'times'}`;

export function HourHeatmap({ grid, accent }: HourHeatmapProps) {
  const { colors, text } = useTheme();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<{ day: number; hour: number } | null>(null);

  if (grid.total < HOUR_GRID_MIN) {
    return (
      <Text variant="small" muted>
        Log on the day itself a few times, and your usual time shows up here.
      </Text>
    );
  }

  const cell = Math.max(4, (width - LABEL) / 24 - GAP);
  const height = 7 * (cell + GAP) + HOURS_ROW;
  const best = busiest(grid);
  const shown = picked ?? best;
  const count = grid.counts[shown.day][shown.hour];

  return (
    <View style={styles.root} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`When you do it: most often ${LONG_DAYS[best.day]} at ${hourLabel(best.hour)}, ${times(best.count)}, out of ${grid.total} logged on the day.`}
        testID="hour-heatmap"
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {DAYS.map((day, d) => (
              <SvgText
                key={day}
                x={0}
                y={d * (cell + GAP) + cell - 1}
                fontSize={10}
                fontFamily={text.small.fontFamily}
                fill={colors.textMuted}
              >
                {day}
              </SvgText>
            ))}
            {[0, 6, 12, 18].map((hour) => (
              <SvgText
                key={hour}
                x={LABEL + hour * (cell + GAP)}
                y={height - 2}
                fontSize={10}
                fontFamily={text.small.fontFamily}
                fill={colors.textMuted}
              >
                {hourLabel(hour)}
              </SvgText>
            ))}
            {grid.counts.map((hours, d) =>
              hours.map((n, h) => {
                const isPicked = picked?.day === d && picked.hour === h;
                return (
                  <G key={`${d}-${h}`} onPress={() => setPicked({ day: d, hour: h })}>
                    <Rect
                      x={LABEL + h * (cell + GAP)}
                      y={d * (cell + GAP)}
                      width={cell}
                      height={cell}
                      rx={2}
                      fill={n > 0 ? accent : colors.surfaceSunken}
                      fillOpacity={n > 0 ? FLOOR + (1 - FLOOR) * (n / grid.max) : 1}
                      stroke={isPicked ? colors.text : 'none'}
                      strokeWidth={isPicked ? 1.5 : 0}
                    />
                  </G>
                );
              })
            )}
          </Svg>
        ) : null}
      </View>
      <Text variant="small" muted numeric accessibilityLiveRegion="polite">
        {LONG_DAYS[shown.day]} at {hourLabel(shown.hour)}: {times(count)}
        {picked ? '' : ', your most usual time'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
});
