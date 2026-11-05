import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  AGAIN_QUESTION,
  cardDetail,
  cardStatus,
  clockLabel,
  clockSpoken,
  elapsedSeconds,
  FOCUS_FADE_MS,
  FocusEventKind,
  focusFromSaved,
  focusMinutes,
  focusReducer,
  focusStart,
  FocusState,
  HabitLevel,
  isDonePhrase,
  isLogged,
  layout,
  MAX_FOCUS_MINUTES,
  MIN_FOCUS_MINUTES,
  minutesLabel,
  plannedSeconds,
  radius,
  remainingMs,
  SavedFocus,
  space,
  STOP_QUESTION,
  timeUpQuestion,
  TodayRow,
} from '@habit-tracker/core';
import { Button, HabitCard, PressableState, Text, TextField, useShortcut, useTheme } from '@habit-tracker/ui';
import { FocusLock } from '../../modules/focus-lock';
import { analytics } from '../services/analytics';
import { checkOffTick } from '../services/haptics';
import { holdNotifications, releaseNotifications } from '../services/focusHold';
import { askForNotifications, notificationsAllowed, showHeldNotifications } from '../services/reminders';
import { tracker } from '../services/tracker';
import { speechInput } from '../voice/speech';

const TICK_MS = 250;
const STEP_MINUTES = 5;

interface FocusModeProps {
  row: TodayRow;
  // A session the phone kept going while the app was closed.
  saved?: SavedFocus | null;
  reducedMotion: boolean;
  onLog: (row: TodayRow, level: HabitLevel) => void;
  onClose: () => void;
}

const record = (row: TodayRow, kind: FocusEventKind, planned: number, elapsed: number | null = null) =>
  // History only: focusing carries on if it can't be written, for example offline.
  Promise.resolve()
    .then(() => tracker.recordFocus(row.habit_id, kind, planned, elapsed))
    .catch(() => {});

// What Android needs before it can keep other apps away and show the countdown on the
// lock screen. Null where there's no lock.
function useLockPermissions() {
  const read = () =>
    FocusLock ? { usage: FocusLock.hasUsageAccess(), overlay: FocusLock.canDrawOverlays() } : null;
  const [granted, setGranted] = useState(read);
  const [notifications, setNotifications] = useState(true);
  useEffect(() => {
    if (!FocusLock) return undefined;
    const check = () => {
      setGranted(read());
      void notificationsAllowed().then(setNotifications);
    };
    check();
    // Granting happens in Settings, so it's checked again on the way back.
    const sub = AppState.addEventListener('change', (next) => next === 'active' && check());
    return () => sub.remove();
  }, []);
  return granted ? { ...granted, notifications } : null;
}

function initialState(row: TodayRow, saved: SavedFocus | null | undefined): FocusState {
  return saved ? focusFromSaved(saved, Date.now()) : focusStart(focusMinutes(row));
}

export function FocusMode({ row, saved, reducedMotion, onLog, onClose }: FocusModeProps) {
  useKeepAwake('tunnel-vision');
  const { colors } = useTheme();
  const [state, dispatch] = useReducer(focusReducer, saved, (s) => initialState(row, s));
  const [now, setNow] = useState(() => Date.now());
  const [typed, setTyped] = useState(String(state.minutes));
  const [speech] = useState(speechInput);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const permissions = useLockPermissions();
  const lockReady = !permissions || (permissions.usage && permissions.overlay && permissions.notifications);
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

  // The phone's lock follows the timer: on while it runs, the countdown kept while paused,
  // and off for every question. It always comes off when this screen goes.
  useEffect(() => {
    if (!FocusLock) return;
    if (state.phase === 'running' && state.endsAt !== null) {
      FocusLock.start(row.habit_id, row.title, state.minutes, state.endsAt);
    } else if (state.phase === 'paused') {
      FocusLock.pause(state.remainingMs);
    } else if (state.phase !== 'setup') {
      FocusLock.stop();
    }
  }, [state.phase, state.endsAt, state.remainingMs, state.minutes, row.habit_id, row.title]);
  useEffect(() => () => FocusLock?.stop(), []);

  // The app's own notifications wait while focusing, and show once it ends.
  const focusing = state.phase === 'running' || state.phase === 'paused';
  useEffect(() => {
    if (!focusing) return undefined;
    holdNotifications();
    // The hold always ends here, even if showing what it kept fails.
    return () => void showHeldNotifications(releaseNotifications());
  }, [focusing]);

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

  // Only "done" logs: the timer running out asks first.
  useEffect(() => {
    if (state.phase !== 'finished' || recorded.current) return;
    recorded.current = true;
    const elapsed = elapsedSeconds(state, Date.now());
    void record(row, 'focus.completed', plannedSeconds(state), elapsed);
    analytics.track('focus_completed', { minutes: state.minutes, early: elapsed < plannedSeconds(state) });
    if (!isLogged(row)) onLog(row, 'full');
    AccessibilityInfo.announceForAccessibility(`${row.title} done and logged.`);
  }, [state, row, onLog]);

  useEffect(() => {
    if (state.phase === 'timeUp') AccessibilityInfo.announceForAccessibility(timeUpQuestion(row.title));
  }, [state.phase, row.title]);

  const at = () => {
    const time = Date.now();
    setNow(time);
    return time;
  };

  const start = () => {
    dispatch({ type: 'start', now: at() });
    void record(row, 'focus.started', plannedSeconds(state));
    analytics.track('focus_started', { minutes: state.minutes });
  };
  const stop = () => dispatch({ type: 'stop', now: at() });
  const done = () => dispatch({ type: 'workDone', now: at() });
  const focusAgain = () => {
    recorded.current = false;
    dispatch({ type: 'focusAgain', now: at() });
    void record(row, 'focus.started', plannedSeconds(state));
  };
  const leaveWithout = (logMinimum: boolean) => {
    if (!recorded.current) {
      recorded.current = true;
      void record(row, 'focus.stopped', plannedSeconds(state), elapsedSeconds(state, now));
      analytics.track('focus_stopped', { minutes: state.minutes, logged_minimum: logMinimum });
    }
    if (logMinimum && !isLogged(row)) onLog(row, 'minimum');
    close();
  };

  // "Done my work", said while holding the mic.
  const listen = async () => {
    if (!speech) return;
    setHeard(null);
    let words = '';
    const started = await speech.start(
      { language: 'en-IN', hints: ['done', 'my work', 'finished', 'ho gaya'] },
      (text) => {
        words = text;
      },
      () => {
        setListening(false);
        if (isDonePhrase(words)) done();
        else setHeard(words.trim() || null);
      }
    );
    setListening(started);
  };

  // Esc on a desktop, and Android's back button, step out the same way.
  const leave = useCallback(() => {
    if (state.phase === 'setup' || state.phase === 'finished') close();
    else if (state.phase === 'asking' || state.phase === 'again') leaveWithout(false);
    else if (state.phase === 'running' || state.phase === 'paused') stop();
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

  const setup = (
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
      {permissions && !lockReady ? (
        <View style={[styles.permissions, { borderColor: colors.border }]}>
          <Text>To keep other apps closed while you focus, and show the countdown on the lock screen, allow:</Text>
          <Button
            label={permissions.usage ? 'Usage access: allowed' : 'Allow usage access'}
            quiet
            disabled={permissions.usage}
            onPress={() => FocusLock?.openUsageAccessSettings()}
          />
          <Button
            label={permissions.overlay ? 'Display over other apps: allowed' : 'Allow display over other apps'}
            quiet
            disabled={permissions.overlay}
            onPress={() => FocusLock?.openOverlaySettings()}
          />
          <Button
            label={permissions.notifications ? 'Notifications: allowed' : 'Allow notifications'}
            quiet
            disabled={permissions.notifications}
            onPress={() => void askForNotifications()}
          />
          <Text variant="small" muted>
            Calls and emergency calls always get through.
          </Text>
        </View>
      ) : null}
      <Button label={`Start ${minutesLabel(state.minutes)}`} disabled={!lockReady} onPress={start} />
      <Button label="Not now" quiet onPress={close} />
    </View>
  );

  const body = (() => {
    switch (state.phase) {
      case 'setup':
        return setup;
      case 'asking':
        return (
          <View style={styles.section}>
            <Text accessibilityLiveRegion="polite">{STOP_QUESTION}</Text>
            <Button label="Yes" onPress={() => leaveWithout(true)} />
            <Button label="No" quiet onPress={() => leaveWithout(false)} />
            <Button label="Keep going" quiet onPress={() => dispatch({ type: 'keepGoing', now: at() })} />
          </View>
        );
      case 'timeUp':
        return (
          <View style={styles.section}>
            <Text accessibilityLiveRegion="polite">{timeUpQuestion(row.title)}</Text>
            <Button label="Yes, it's done" onPress={done} />
            <Button label="Not yet" quiet onPress={() => dispatch({ type: 'notDone' })} />
          </View>
        );
      case 'again':
        return (
          <View style={styles.section}>
            <Text accessibilityLiveRegion="polite">{AGAIN_QUESTION}</Text>
            <Button label={`Focus ${minutesLabel(state.minutes)} more`} onPress={focusAgain} />
            <Button label="Not now" quiet onPress={() => leaveWithout(false)} />
          </View>
        );
      case 'finished':
        return (
          <View style={styles.section}>
            <Text accessibilityLiveRegion="polite">Done. Nicely focused.</Text>
            <Button label="Close" onPress={close} />
          </View>
        );
      default:
        return (
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
              <Button label="Resume" onPress={() => dispatch({ type: 'resume', now: at() })} />
            ) : (
              <Button label="Pause" onPress={() => dispatch({ type: 'pause', now: at() })} />
            )}
            <Button label="Done my work" quiet onPress={done} />
            {speech ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hold and say done my work"
                onPressIn={() => void listen()}
                onPressOut={() => speech.stop()}
                style={({ focused }: PressableState) => [
                  styles.mic,
                  {
                    backgroundColor: listening ? colors.text : colors.surfaceSunken,
                    borderColor: focused ? colors.textMuted : colors.border,
                  },
                ]}
              >
                <Text style={listening ? { color: colors.surface } : undefined}>
                  {listening ? 'Listening…' : 'Hold and say “done my work”'}
                </Text>
              </Pressable>
            ) : null}
            {heard ? (
              <Text variant="small" muted accessibilityLiveRegion="polite">
                Heard “{heard}”. Say “done my work” when you&apos;re finished.
              </Text>
            ) : null}
            <Button label="Stop" quiet onPress={stop} />
          </View>
        );
    }
  })();

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
        {body}
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
  permissions: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  mic: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
