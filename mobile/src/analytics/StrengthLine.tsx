import React, { useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { shortDate, space, StrengthPoint, weekLabel } from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

const HEIGHT = 120;
// Room at the ends so the marker's ring isn't cut off.
const PAD = 6;

interface StrengthLineProps {
  points: StrengthPoint[];
  accent: string;
  // Each point is a week for a times-per-week habit.
  weekly: boolean;
}

const when = (point: StrengthPoint, weekly: boolean) => (weekly ? weekLabel(point.date) : shortDate(point.date));

export function StrengthLine({ points, accent, weekly }: StrengthLineProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <Text variant="small" muted>
        Strength grows a little with every day you log. A few {weekly ? 'weeks' : 'days'} in, its line starts here.
      </Text>
    );
  }

  const x = (i: number) => PAD + (i / (points.length - 1)) * (width - PAD * 2);
  const y = (strength: number) => PAD + (1 - strength / 100) * (HEIGHT - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.strength).toFixed(1)}`).join(' ');
  const shown = points[picked ?? points.length - 1];
  const first = points[0];
  const pick = (event: GestureResponderEvent) => {
    const at = (event.nativeEvent.locationX - PAD) / Math.max(1, width - PAD * 2);
    setPicked(Math.min(points.length - 1, Math.max(0, Math.round(at * (points.length - 1)))));
  };

  return (
    <View style={styles.root}>
      <Pressable
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        onPress={pick}
        accessibilityRole="image"
        accessibilityLabel={`Strength, from 0 to 100: ${first.strength} on ${when(first, weekly)}, now ${points.at(-1)!.strength}.`}
        testID="strength-line"
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {[0, 50, 100].map((level) => (
              <Line key={level} x1={0} x2={width} y1={y(level)} y2={y(level)} stroke={colors.border} strokeWidth={1} />
            ))}
            <Path d={path} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <Circle
              cx={x(picked ?? points.length - 1)}
              cy={y(shown.strength)}
              r={4}
              fill={accent}
              stroke={colors.canvas}
              strokeWidth={2}
            />
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </Pressable>
      <Text variant="small" muted numeric accessibilityLiveRegion="polite">
        {shown.strength} on {when(shown, weekly)}
        {picked === null ? ' · tap the line for any day' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
});
