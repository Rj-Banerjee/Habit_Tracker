import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { Chain, dayLabel, IdentityToken, LinkKind, space, statusLabels } from '@habit-tracker/core';
import {
  CHAIN_HEIGHT,
  CHAIN_NODE,
  CRACK_APART,
  crackPath,
  halfLeft,
  halfRight,
  linkSpan,
  LinkSpan,
  nodeCentres,
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

export const chainSummary = (chain: Chain) =>
  `Last ${chain.nodes.length} days: ${chain.nodes
    .map((node) => `${dayLabel(node.date)} ${statusLabels[node.status].toLowerCase()}`)
    .join(', ')}`;

// The still chain, for Progress and anywhere a streak is shown without a moment playing.
export function StreakChain({ chain, identity, seamLabels }: StreakChainProps) {
  const colours = useChainColours(identity);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState<string | null>(null);
  const centres = nodeCentres(chain.nodes.length, width);

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
            </G>
          ))}
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
