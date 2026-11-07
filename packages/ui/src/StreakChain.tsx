import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { Chain, ChainNode, dayLabel, IdentityToken, LinkKind, space, statusLabels } from '@habit-tracker/core';
import {
  CHAIN_HEIGHT,
  CHAIN_NODE,
  chainCentres,
  CRACK_APART,
  crackPath,
  endCapPath,
  halfLeft,
  halfRight,
  linkSpan,
  LinkSpan,
  partialRadius,
  QUIET_APART,
  stitchesPath,
  wholeLink,
} from './chainGeometry';
import { useTheme } from './ThemeProvider';
import { StatusShapes } from './StatusMark';
import { Text } from './Text';

interface StreakChainProps {
  chain: Chain;
  identity: IdentityToken;
  // What a stitched seam says when held or hovered, by the index of the day it leads into.
  seamLabels?: Record<number, string>;
}

export interface ChainColours {
  accent: string;
  onAccent: string;
  hollow: string;
  muted: string;
}

export function LinkMark({ kind, span, colours }: { kind: LinkKind; span: LinkSpan; colours: ChainColours }) {
  const line = { strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };
  switch (kind) {
    case 'chain':
      return <Path d={wholeLink(span)} stroke={colours.accent} {...line} />;
    case 'pending':
      return <Path d={wholeLink(span)} stroke={colours.hollow} strokeDasharray="2 4" {...line} />;
    case 'crack':
      return (
        <>
          <Path d={halfLeft(span, CRACK_APART)} stroke={colours.accent} {...line} />
          <Path d={halfRight(span, CRACK_APART)} stroke={colours.accent} {...line} />
          <Path d={crackPath(span)} stroke={colours.hollow} strokeWidth={1.25} strokeLinejoin="round" fill="none" />
        </>
      );
    case 'gap':
      return (
        <>
          <Path d={halfLeft(span, QUIET_APART)} stroke={colours.hollow} {...line} />
          <Path d={halfRight(span, QUIET_APART)} stroke={colours.hollow} {...line} />
        </>
      );
    case 'seam':
      return (
        <>
          <Path d={wholeLink(span)} stroke={colours.accent} {...line} />
          <Path d={stitchesPath(span)} stroke={colours.accent} strokeWidth={1.5} strokeLinecap="round" />
        </>
      );
  }
}

export function useChainColours(identity: IdentityToken): ChainColours {
  const { colors, identity: identityColor } = useTheme();
  const { accent, onAccent } = identityColor(identity);
  return { accent, onAccent, hollow: colors.hollow, muted: colors.textMuted };
}

const weekLabel = (date: string) =>
  `week of ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`)
  )}`;

const nodeSummary = (node: ChainNode, unit: Chain['unit']) => {
  const when = unit === 'week' ? weekLabel(node.date) : dayLabel(node.date);
  const partly = node.partial !== undefined ? ', partly done' : '';
  return `${when} ${statusLabels[node.status].toLowerCase()}${partly}`;
};

export const chainSummary = (chain: Chain) =>
  `Last ${chain.nodes.length} ${chain.unit === 'week' ? 'weeks' : 'days'}: ${chain.nodes
    .map((node) => nodeSummary(node, chain.unit))
    .join(', ')}${chain.ended ? '. Finished' : ''}`;

// Drawn over a hollow node, in its 28-unit space: how far a day below the minimum got.
export function PartialMark({ share, colour }: { share: number; colour: string }) {
  return <Circle cx={14} cy={14} r={partialRadius(share)} fill={colour} opacity={0.55} />;
}

export function EndCap({ lastCentre, colour }: { lastCentre: number; colour: string }) {
  return <Path d={endCapPath(lastCentre)} stroke={colour} strokeWidth={2} strokeLinecap="round" />;
}

// The still chain, for Progress and anywhere a streak is shown without a moment playing.
export function StreakChain({ chain, identity, seamLabels }: StreakChainProps) {
  const colours = useChainColours(identity);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState<string | null>(null);
  const centres = chainCentres(chain.nodes.length, width, chain.ended);

  return (
    <View
      style={styles.box}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={chainSummary(chain)}
    >
      {width > 0 ? (
        <Svg width={width} height={CHAIN_HEIGHT}>
          {chain.links.map((kind, i) => (
            <LinkMark key={`l${i}`} kind={kind} span={linkSpan(centres[i], centres[i + 1])} colours={colours} />
          ))}
          {chain.nodes.map((node, i) => (
            <G
              key={node.date}
              transform={`translate(${centres[i] - CHAIN_NODE / 2} ${(CHAIN_HEIGHT - CHAIN_NODE) / 2}) scale(${CHAIN_NODE / 28})`}
            >
              <StatusShapes status={node.status} {...colours} />
              {node.partial !== undefined ? <PartialMark share={node.partial} colour={colours.accent} /> : null}
            </G>
          ))}
          {chain.ended && chain.nodes.length > 0 ? (
            <EndCap lastCentre={centres[chain.nodes.length - 1]} colour={colours.accent} />
          ) : null}
        </Svg>
      ) : null}
      {width > 0 && seamLabels
        ? Object.entries(seamLabels).map(([index, label]) => {
            const i = Number(index);
            const span = linkSpan(centres[i - 1], centres[i]);
            return (
              <Pressable
                key={index}
                accessibilityRole="text"
                accessibilityLabel={label}
                onLongPress={() => setShown(label)}
                onPressOut={() => setShown(null)}
                onHoverIn={() => setShown(label)}
                onHoverOut={() => setShown(null)}
                style={[styles.seam, { left: span.mid - SEAM_HIT / 2 }]}
              />
            );
          })
        : null}
      {shown ? (
        <Text variant="small" muted style={styles.tip}>
          {shown}
        </Text>
      ) : null}
    </View>
  );
}

const SEAM_HIT = 32;

const styles = StyleSheet.create({
  box: { height: CHAIN_HEIGHT, justifyContent: 'center' },
  seam: { position: 'absolute', top: -4, width: SEAM_HIT, height: CHAIN_HEIGHT + 8 },
  tip: { position: 'absolute', top: CHAIN_HEIGHT + space.xs, left: 0 },
});
