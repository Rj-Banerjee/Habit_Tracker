import React from 'react';
import { Circle, G, Line, Rect } from 'react-native-svg';
import { HeatKind, IdentityToken } from '@habit-tracker/core';
import { useTheme } from '@habit-tracker/ui';

interface HeatCellProps {
  kind: HeatKind;
  identity: IdentityToken;
  x?: number;
  y?: number;
  size: number;
}

// Shape carries the meaning as well as colour, so each kind reads for colour-blind
// users, and a miss is only ever a quiet hollow ring.
export function HeatCell({ kind, identity, x = 0, y = 0, size }: HeatCellProps) {
  const { colors, identity: identityColor } = useTheme();
  const { accent, onAccent } = identityColor(identity);
  const middle = size / 2;
  const corner = size / 6;
  const inset = 1;
  const inner = size - inset * 2;
  const outline = { x: inset, y: inset, width: inner, height: inner, rx: corner };

  return (
    <G x={x} y={y}>
      {kind === 'empty' ? (
        <Rect width={size} height={size} rx={corner} fill={colors.surfaceSunken} />
      ) : null}
      {kind === 'done' ? <Rect width={size} height={size} rx={corner} fill={accent} /> : null}
      {kind === 'minimum' ? (
        <>
          <Rect {...outline} fill="none" stroke={accent} strokeWidth={1.5} />
          <Rect x={inset} y={middle} width={inner} height={middle - inset} fill={accent} />
        </>
      ) : null}
      {kind === 'repaired' ? (
        <>
          <Rect width={size} height={size} rx={corner} fill={accent} />
          <Line
            x1={middle}
            y1={size * 0.15}
            x2={middle}
            y2={size * 0.85}
            stroke={onAccent}
            strokeWidth={2}
          />
          <Line
            x1={size * 0.28}
            y1={middle}
            x2={size * 0.72}
            y2={middle}
            stroke={onAccent}
            strokeWidth={1.5}
          />
        </>
      ) : null}
      {kind === 'protected' ? (
        <>
          <Rect {...outline} fill="none" stroke={accent} strokeWidth={1.5} />
          <Circle cx={middle} cy={middle} r={size * 0.2} fill={accent} />
        </>
      ) : null}
      {kind === 'skipped' ? (
        <>
          <Rect width={size} height={size} rx={corner} fill={colors.surfaceSunken} />
          <Line
            x1={size * 0.25}
            y1={middle}
            x2={size * 0.75}
            y2={middle}
            stroke={colors.textMuted}
            strokeWidth={2}
          />
        </>
      ) : null}
      {kind === 'missed' ? (
        <Circle cx={middle} cy={middle} r={middle - 2} fill="none" stroke={colors.hollow} strokeWidth={1.5} />
      ) : null}
    </G>
  );
}
