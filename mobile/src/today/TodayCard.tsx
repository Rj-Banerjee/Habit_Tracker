import React from 'react';
import { cardDetail, cardStatus, Chain, MotionSettings, TodayRow } from '@habit-tracker/core';
import { HabitCard } from '@habit-tracker/ui';
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
}: TodayCardProps) {
  const count = useCountUp(row.current_streak);
  const weld = playing?.moment.kind === 'weld' ? playing.moment : null;

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
      footer={
        chain && chain.nodes.length > 1 ? (
          <CardChain
            row={row}
            chain={chain}
            playing={playing}
            settings={settings}
            onFinish={onMomentFinish}
            onSeam={weld && chain ? () => count.start(streakBeforeWeld(chain, weld.date)) : undefined}
            onOpen={onOpenDetail}
          />
        ) : undefined
      }
    />
  );
}
