import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, StyleSheet, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  cardDetail,
  cardStatus,
  clockLabel,
  clockSpoken,
  elapsedSeconds,
  FOCUS_FADE_MS,
  FocusEventKind,
  focusMinutes,
  focusReducer,
  focusStart,
  HabitLevel,
  isLogged,
  layout,
  MAX_FOCUS_MINUTES,
  MIN_FOCUS_MINUTES,
  plannedSeconds,
  remainingMs,
  space,
  STOP_QUESTION,
  TodayRow,
} from '@habit-tracker/core';
import { Button, HabitCard, Text, TextField, useShortcut, useTheme } from '@habit-tracker/ui';
import { checkOffTick } from '../services/haptics';
import { holdNotifications, releaseNotifications } from '../services/focusHold';
import { showHeldNotifications } from '../services/reminders';
import { tracker } from '../services/tracker';

const TICK_MS = 250;
const STEP_MINUTES = 5;

interface FocusModeProps {
  row: TodayRow;
  reducedMotion: boolean;
  onLog: (row: TodayRow, level: HabitLevel) => void;
  onClose: () => void;
}

const record = (row: TodayRow, kind: FocusEventKind, planned: number, elapsed: number | null = null) =>
  // History only: focusing carries on if it can't be written, for example offline.
  Promise.resolve()
    .then(() => tracker.recordFocus(row.habit_id, kind, planned, elapsed))
    .catch(() => {});

export function FocusMode({ row, reducedMotion, onLog, onClose }: FocusModeProps) {
  useKeepAwake('tunnel-vision');
  const { colors } = useTheme();
  const [state, dispatch] = useReducer(focusReducer, focusMinutes(row), focusStart);
  const [now, setNow] = useState(() => Date.now());
  const [typed, setTyped] = useState(String(state.minutes));
  const recorded = useRef(false);
  const closing = useRef(false);

  // Everything else fades out: this layer fades in over it. Without reduced motion the
  // habit also settles into the middle.
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(1, { duration: FOCUS_FADE_MS, easing: Easing.out(Easing.cubic) }));
  }, [shown]);
  const layer = useAnimatedStyle(() => ({ opacity: shown.value }));
  const settle = useAnimatedStyle(() =>
    reducedMotion
      ? {}
      : { transform: [{ translateY: 12 * (1 - shown.value) }, { scale: 0.96 + 0.04 * shown.value }] }
  );

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    shown.set(withTiming(0, { duration: FOCUS_FADE_MS }));
    setTimeout(onClose, FOCUS_FADE_MS);
  }, [onClose, shown]);

  // The app's own notifications wait while focusing, and show once it ends.
  const running = state.phase === 'running' || state.phase === 'paused' || state.phase === 'asking';
  useEffect(() => {
    if (!running) return undefined;
    holdNotifications();
    // The hold always ends here, even if showing what it kept fails.
    return () => void showHeldNotifications(releaseNotifications());
  }, [running]);

  // The clock, by wall time, so a sleep or a trip to another app never loses time.
  useEffect(() => {
    if (state.phase !== 'running') return undefined;
    const beat = () => {
      const at = Date.now();
      setNow(at);
      dispatch({ type: 'tick', now: at });
    };
    const timer = setInterval(beat, TICK_MS);
    const back = AppState.addEventListener('change', (next) => next === 'active' && beat());
    return () => {
      clearInterval(timer);
      back.remove();
    };
  }, [state.phase]);

  // Finishing logs the full version, unless it was already logged.
  useEffect(() => {
    if (state.phase !== 'finished' || recorded.current) return;
    recorded.current = true;
    void record(row, 'focus.completed', plannedSeconds(state), plannedSeconds(state));
    if (!isLogged(row)) onLog(row, 'full');
    AccessibilityInfo.announceForAccessibility(`Focus done. ${row.title} logged.`);
  }, [state, row, onLog]);

  const start = () => {
    dispatch({ type: 'start', now: Date.now() });
    setNow(Date.now());
    void record(row, 'focus.started', plannedSeconds(state));
  };
  const stop = () => {
    dispatch({ type: 'stop', now: Date.now() });
    setNow(Date.now());
  };
  const answer = (logMinimum: boolean) => {
    if (!recorded.current) {
      recorded.current = true;
      void record(row, 'focus.stopped', plannedSeconds(state), elapsedSeconds(state, now));
    }
    if (logMinimum && !isLogged(row)) onLog(row, 'minimum');
    close();
  };

  // Esc on a desktop, and Android's back button, step out the same way.
  const leave = useCallback(() => {
    if (state.phase === 'setup' || state.phase === 'finished') close();
    else if (state.phase === 'asking') answer(false);
    else stop();
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, close]);
  useShortcut('Escape', leave);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', leave);
    return () => sub.remove();
  }, [leave]);

  const setMinutes = (minutes: number) => {
    dispatch({ type: 'setMinutes', minutes });
    setTyped(String(Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(minutes)))));
  };

  const left = remainingMs(state, now);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.layer, { backgroundColor: colors.canvas }, layer]}
      accessibilityViewIsModal
    >
      <Animated.View style={[styles.column, settle]}>
        <Text variant="small" muted accessibilityRole="header">
          Tunnel Vision
        </Text>
        <HabitCard
          title={row.title}
          status={cardStatus(row)}
          identity={row.colour_token}
          streak={row.current_streak}
          detail={cardDetail(row)}
          onCheckOff={checkOffTick}
        />

        {state.phase === 'setup' ? (
          <View style={styles.section}>
            <View style={styles.stepper}>
              <Button label="−5" quiet onPress={() => setMinutes(state.minutes - STEP_MINUTES)} accessibilityLabel="5 minutes less" />
              <View style={styles.minutes}>
                <TextField
                  label="Minutes"
                  value={typed}
                  keyboardType="number-pad"
                  maxLength={3}
                  onChangeText={(text) => {
                    setTyped(text);
                    const minutes = Number(text);
                    if (Number.isFinite(minutes) && minutes > 0) dispatch({ type: 'setMinutes', minutes });
                  }}
                  onBlur={() => setTyped(String(state.minutes))}
                />
              </View>
              <Button label="+5" quiet onPress={() => setMinutes(state.minutes + STEP_MINUTES)} accessibilityLabel="5 minutes more" />
            </View>
            <Button label={`Start ${state.minutes} minutes`} onPress={start} />
            <Button label="Not now" quiet onPress={close} />
          </View>
        ) : state.phase === 'asking' ? (
          <View style={styles.section}>
            <Text accessibilityLiveRegion="polite">{STOP_QUESTION}</Text>
            <Button label="Yes" onPress={() => answer(true)} />
            <Button label="No" quiet onPress={() => answer(false)} />
            <Button label="Keep going" quiet onPress={() => dispatch({ type: 'keepGoing', now: Date.now() })} />
          </View>
        ) : state.phase === 'finished' ? (
          <View style={styles.section}>
            <Text variant="display" numeric style={styles.clock} accessibilityElementsHidden>
              {clockLabel(0)}
            </Text>
            <Text accessibilityLiveRegion="polite">Done. Nicely focused.</Text>
            <Button label="Close" onPress={close} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text
              variant="display"
              numeric
              style={styles.clock}
              accessibilityRole="timer"
              accessibilityLabel={clockSpoken(left)}
            >
              {clockLabel(left)}
            </Text>
            {state.phase === 'paused' ? (
              <Button label="Resume" onPress={() => dispatch({ type: 'resume', now: Date.now() })} />
            ) : (
              <Button label="Pause" onPress={() => dispatch({ type: 'pause', now: Date.now() })} />
            )}
            <Button label="Stop" quiet onPress={stop} />
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { justifyContent: 'center', zIndex: 10 },
  column: {
    width: '100%',
    maxWidth: layout.readingWidth,
    alignSelf: 'center',
    gap: space.xl,
    padding: space.lg,
  },
  section: { gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  minutes: { flex: 1 },
  clock: { textAlign: 'center' },
});
