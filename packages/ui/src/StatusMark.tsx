import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { HabitCardStatus, IdentityToken } from '@habit-tracker/core';
import { useTheme } from './ThemeProvider';

interface StatusMarkProps {
  status: HabitCardStatus;
  identity: IdentityToken;
  size?: number;
}

const CENTRE = 14;
const RADIUS = 12;
const HOLLOW_RADIUS = 6;

// Each state has its own shape, so none of them depends on colour alone.
export function StatusMark({ status, identity, size = 28 }: StatusMarkProps) {
  const { colors, identity: identityColor } = useTheme();
  const { accent, onAccent } = identityColor(identity);

  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      {status === 'due' && (
        <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} stroke={accent} strokeWidth={2} fill="none" />
      )}

      {status === 'done' && (
        <>
          <Circle cx={CENTRE} cy={CENTRE} r={13} fill={accent} />
          <Path d="M8 14.5l4 4 8-9" stroke={onAccent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}

      {status === 'doneMinimum' && (
        <>
          <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} stroke={accent} strokeWidth={2} fill="none" />
          <Path d="M14 26a12 12 0 0 1 0-24z" fill={accent} />
        </>
      )}

      {status === 'skipped' && (
        <>
          <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} stroke={colors.hollow} strokeWidth={2} strokeDasharray="3 4" fill="none" />
          <Line x1={9} y1={14} x2={19} y2={14} stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" />
        </>
      )}

      {status === 'open' && (
        <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} stroke={colors.hollow} strokeWidth={2} fill="none" />
      )}

      {status === 'missed' && (
        <Circle cx={CENTRE} cy={CENTRE} r={HOLLOW_RADIUS} stroke={colors.hollow} strokeWidth={2} fill="none" />
      )}

      {status === 'repaired' && (
        <>
          <Circle cx={CENTRE} cy={CENTRE} r={13} fill={accent} />
          <Path d="M14 5v18M10 9h8M10 14h8M10 19h8" stroke={onAccent} strokeWidth={2.25} strokeLinecap="round" fill="none" />
        </>
      )}

      {status === 'protected' && (
        <>
          <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} stroke={accent} strokeWidth={2} fill="none" />
          <Path d="M14 7.5l6 2.25v4.5c0 3.5-2.5 5.75-6 7-3.5-1.25-6-3.5-6-7v-4.5z" fill={accent} />
        </>
      )}
    </Svg>
  );
}
