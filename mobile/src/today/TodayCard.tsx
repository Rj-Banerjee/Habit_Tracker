import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardDetail, cardStatus, Chain, layout, MotionSettings, radius, space, TodayRow } from '@habit-tracker/core';
import { HabitCard, PressableState, Text, useTheme } from '@habit-tracker/ui';
import { CardChain, streakBeforeWeld, useCountUp } from '../chain/CardChain';
import { PlayingMoment } from '../hooks/useMoments';
import { checkOffTick } from '../services/haptics';

interface TodayCardProps {
  row: TodayRow;
  chain?: Chain;
  playing?: PlayingMoment;
  settings: MotionSettings;
  onPress: () => void;
  onLongPress: () => void;
  onSkip: () => void;
  onMomentFinish: () => void;
  onOpenDetail: () => void;
  // Tunnel Vision, for today's habits.
  onFocus?: () => void;
}

function FocusButton({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Focus on ${title}`}
      hitSlop={4}
      style={({ pressed, hovered }: PressableState) => [
        styles.focus,
        { borderColor: colors.border, backgroundColor: pressed || hovered ? colors.surfaceSunken : 'transparent' },
      ]}
    >
      <Text variant="small">Focus</Text>
    </Pressable>
  );
}

export function TodayCard({
  row,
  chain,
  playing,
  settings,
  onPress,
  onLongPress,
  onSkip,
  onMomentFinish,
  onOpenDetail,
  onFocus,
}: TodayCardProps) {
  const count = useCountUp(row.current_streak);
  const weld = playing?.moment.kind === 'weld' ? playing.moment : null;
  const hasChain = chain !== undefined && chain.nodes.length > 1;

  return (
    <HabitCard
      title={row.title}
      status={cardStatus(row)}
      identity={row.colour_token}
      streak={count.shown ?? row.current_streak}
      detail={cardDetail(row)}
      onPress={onPress}
      onLongPress={onLongPress}
      onSkip={onSkip}
      onCheckOff={checkOffTick}
      onFocusMode={onFocus}
      footer={
        hasChain || onFocus ? (
          <View style={styles.footer}>
            <View style={styles.chain}>
              {hasChain ? (
                <CardChain
                  row={row}
                  chain={chain}
                  playing={playing}
                  settings={settings}
                  onFinish={onMomentFinish}
                  onSeam={weld ? () => count.start(streakBeforeWeld(chain, weld.date)) : undefined}
                  onOpen={onOpenDetail}
                />
              ) : null}
            </View>
            {onFocus ? <FocusButton title={row.title} onPress={onFocus} /> : null}
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chain: { flex: 1 },
  focus: {
    minHeight: layout.minTouchTarget,
    minWidth: layout.minTouchTarget,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
