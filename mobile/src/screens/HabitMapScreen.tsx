import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import {
  Connection,
  layout,
  LINK_COLORS,
  linkWidth,
  mapHabits,
  mapLayout,
  mapLinks,
  space,
} from '@habit-tracker/core';
import { Button, Text, useLayoutSize, useShortcut, useTheme } from '@habit-tracker/ui';
import { ConnectionCards } from '../analytics/ConnectionCards';
import { tracker } from '../services/tracker';

const NODE = 22;
const PADDING = 56;
const MAX_SIZE = 520;
// Lines are thin; this much around each answers a tap.
const TAP_WIDTH = 26;

interface HabitMapScreenProps {
  onClose: () => void;
}

const strength = (c: Connection) => (Math.abs(c.effect) >= 0.4 ? 'strong' : 'clear');

// Habits as circles, and the links measured between them: green where one seems to help
// the other, amber and dashed where they compete. Tap a link for its numbers and fixes.
export function HabitMapScreen({ onClose }: HabitMapScreenProps) {
  const { colors, name, text } = useTheme();
  const wide = useLayoutSize() !== 'compact';
  const [items, setItems] = useState<Connection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  useShortcut('Escape', onClose);

  useEffect(() => {
    Promise.resolve()
      .then(() => tracker.getConnections(null))
      .then(setItems)
      .catch(() => setFailed(true));
  }, []);

  const size = Math.min(width, MAX_SIZE);
  const links = useMemo(() => (items ? mapLinks(items) : []), [items]);
  const nodes = useMemo(() => (items ? mapLayout(mapHabits(items), size, PADDING) : []), [items, size]);
  const at = new Map(nodes.map((n) => [n.id, n]));
  const palette = LINK_COLORS[name];
  const selected = links.find((l) => l.connection.id === picked)?.connection ?? null;

  const body = () => {
    if (failed) return <Text muted>The map couldn&apos;t load. Check the connection and open it again.</Text>;
    if (!items) return <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading the map" />;
    if (links.length === 0) {
      return (
        <Text muted>
          Links show up here once a few weeks of your habits (and check-ins) show a clear pattern. They&apos;re measured
          each night.
        </Text>
      );
    }
    return (
      <View style={[styles.split, wide && styles.splitWide]}>
        <View style={styles.mapColumn} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {size > 0 ? (
            <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {links.map(({ connection, from, to }) => {
                const a = at.get(from);
                const b = at.get(to);
                if (!a || !b) return null;
                const color = connection.direction === 'helps' ? palette.helps : palette.competes;
                const isPicked = picked === connection.id;
                return (
                  <G key={connection.id} onPress={() => setPicked(connection.id)}>
                    <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={TAP_WIDTH} />
                    <Line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={color}
                      strokeOpacity={picked && !isPicked ? 0.35 : 1}
                      strokeWidth={linkWidth(connection.effect) + (isPicked ? 2 : 0)}
                      strokeDasharray={connection.direction === 'competes' ? '8 6' : undefined}
                      strokeLinecap="round"
                    />
                  </G>
                );
              })}
              {nodes.map((n) => (
                <G key={n.id}>
                  <Circle cx={n.x} cy={n.y} r={NODE} fill={colors.surface} stroke={colors.text} strokeWidth={1.5} />
                  <SvgText
                    x={n.x}
                    y={n.y + NODE + 16}
                    textAnchor="middle"
                    fontSize={12}
                    fontFamily={text.small.fontFamily}
                    fill={colors.text}
                  >
                    {n.title.length > 16 ? `${n.title.slice(0, 15)}…` : n.title}
                  </SvgText>
                </G>
              ))}
            </Svg>
          ) : null}
          <View style={styles.legend}>
            <Text variant="small" muted>
              Green: seems to help. Amber, dashed: seems to compete. Thicker: stronger.
            </Text>
          </View>
        </View>
        <View style={styles.side}>
          {/* Every link as a button too, for screen readers and keyboards. */}
          {links.map(({ connection }) => {
            const [a, b] = connection.subjects;
            const names = `${'title' in a ? a.title : ''} and ${'title' in b ? b.title : ''}`;
            return (
              <Button
                key={connection.id}
                quiet
                label={`${names}: ${connection.direction === 'helps' ? 'helps' : 'competes'}, ${strength(connection)}`}
                onPress={() => setPicked(connection.id)}
              />
            );
          })}
          {selected ? <ConnectionCards habitId={null} only={selected.id} limit={1} /> : (
            <Text variant="small" muted>
              Tap a link to see its numbers and what might help.
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]}>
        <View style={styles.back}>
          <Button label="Back" quiet onPress={onClose} />
        </View>
        <Text variant="title" accessibilityRole="header">
          Habit map
        </Text>
        {body()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg, width: '100%', maxWidth: layout.readingWidth, alignSelf: 'center', padding: space.lg },
  contentWide: { maxWidth: layout.breakpoints.desktop },
  back: { alignSelf: 'flex-start' },
  split: { gap: space.lg },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mapColumn: { flex: 1, alignItems: 'center', gap: space.sm },
  legend: { alignSelf: 'stretch' },
  side: { flex: 1, gap: space.sm },
});
