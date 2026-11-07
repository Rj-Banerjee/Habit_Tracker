import React, { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import {
  Chain,
  fractureCaption,
  MotionSettings,
  PROTECTED_CAPTION,
  repairHint,
  TodayRow,
  weekRepairHint,
  WELD_MS,
  weldCaption,
} from '@habit-tracker/core';
import { StreakChain } from '@habit-tracker/ui';
import { PlayingMoment } from '../hooks/useMoments';
import { MomentCaptions, MomentChain } from './MomentChain';

const COUNT_UP_MS = WELD_MS.seam[1] - WELD_MS.seam[0];

export const repairHabitOf = (row: TodayRow) => ({
  title: row.title,
  type: row.habit_type,
  target: row.target,
  unit: row.unit,
});

export function captionsFor(playing: PlayingMoment, chain: Chain, row: TodayRow): MomentCaptions {
  const { moment } = playing;
  const unit = chain.unit ?? 'day';
  if (moment.kind === 'weld') return { caption: weldCaption(row.current_streak, unit) };
  if (moment.kind === 'protected') return { caption: PROTECTED_CAPTION };
  const repairOn = chain.nodes.find((n) => n.date === moment.date)?.repairOn ?? null;
  const hint =
    unit === 'week' ? weekRepairHint(row.week_quota ?? 1) : repairOn ? repairHint(repairHabitOf(row), repairOn) : '';
  return {
    caption: fractureCaption(moment.date, repairOn, unit),
    repairHint: repairOn ? hint : undefined,
  };
}

// The streak before a weld: the logged days after the crack it closes.
export function streakBeforeWeld(chain: Chain, date: string) {
  const index = chain.nodes.findIndex((n) => n.date === date);
  return chain.nodes
    .slice(index + 1)
    .filter((n) => n.status === 'done' || n.status === 'doneMinimum' || n.status === 'repaired').length;
}

// Counts the streak number up when a weld's seam forms.
export function useCountUp(to: number) {
  const [shown, setShown] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  const start = (from: number) => {
    if (from >= to) return;
    const steps = to - from;
    const every = Math.max(16, COUNT_UP_MS / steps);
    let value = from;
    setShown(value);
    timer.current = setInterval(() => {
      value += 1;
      if (value >= to) {
        if (timer.current) clearInterval(timer.current);
        setShown(null);
      } else {
        setShown(value);
      }
    }, every);
  };
  return { shown, start };
}

interface CardChainProps {
  row: TodayRow;
  chain: Chain;
  playing?: PlayingMoment;
  settings: MotionSettings;
  onFinish: () => void;
  onSeam?: () => void;
  onOpen: () => void;
}

export function CardChain({ row, chain, playing, settings, onFinish, onSeam, onOpen }: CardChainProps) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${row.title} streak`}
      accessibilityHint="Opens this habit's streak and details"
      hitSlop={8}
    >
      {playing ? (
        <MomentChain
          chain={chain}
          moment={playing.moment}
          identity={row.colour_token}
          settings={settings}
          captions={captionsFor(playing, chain, row)}
          interrupted={playing.interrupted}
          onFinish={onFinish}
          onSeam={onSeam}
        />
      ) : (
        <StreakChain chain={chain} identity={row.colour_token} />
      )}
    </Pressable>
  );
}
