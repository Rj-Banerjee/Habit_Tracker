import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { G } from 'react-native-svg';
import {
  HEAT_LABELS,
  HeatCell as HeatCellData,
  Heatmap as HeatmapData,
  HeatKind,
  IdentityToken,
  shortDate,
  space,
} from '@habit-tracker/core';
import { Text } from '@habit-tracker/ui';
import { HeatCell } from './HeatCell';

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LEGEND: HeatKind[] = ['done', 'minimum', 'repaired', 'protected', 'skipped', 'missed'];

interface HeatmapProps {
  data: HeatmapData;
  identity: IdentityToken;
}

const summary = ({ counts }: HeatmapData) =>
  `In the last year: ${LEGEND.map((kind) => `${counts[kind]} ${HEAT_LABELS[kind].toLowerCase()}`).join(', ')}.`;

export function Heatmap({ data, identity }: HeatmapProps) {
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const width = data.weeks.length * STEP;
  const [picked, setPicked] = useState<HeatCellData | null>(null);

  return (
    <View style={styles.root}>
      {/* Narrow screens scroll, and start at the most recent weeks. */}
      <ScrollView
        ref={scroller}
        horizontal
        testID="heatmap"
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      >
        <View accessible accessibilityRole="image" accessibilityLabel={summary(data)}>
          <Svg width={width} height={7 * STEP}>
            {data.weeks.flatMap((week, column) =>
              week.map((cell, row) => (
                <G key={cell.date} onPress={() => setPicked(cell)}>
                  <HeatCell kind={cell.kind} identity={identity} x={column * STEP} y={row * STEP} size={CELL} />
                </G>
              ))
            )}
          </Svg>
        </View>
      </ScrollView>
      <Text variant="small" muted numeric accessibilityLiveRegion="polite">
        {picked ? `${shortDate(picked.date)}: ${HEAT_LABELS[picked.kind]}` : 'Tap a day to see it'}
      </Text>
      <View style={styles.legend}>
        {LEGEND.map((kind) => (
          <View key={kind} style={styles.key}>
            <Svg width={CELL} height={CELL}>
              <HeatCell kind={kind} identity={identity} size={CELL} />
            </Svg>
            <Text variant="small" muted numeric>
              {HEAT_LABELS[kind]} {data.counts[kind]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  key: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
