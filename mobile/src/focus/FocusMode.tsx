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
import { onFocusCommand } from '../services/focusCommands';
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

// The countdown is a notification, so Android 13 and later need permission first. Null
// where there's no lock, as on iPhone and the web.
function useNotificationPermission() {
  const [allowed, setAllowed] = useState<boolean | null>(FocusLock ? true : null);
  useEffect(() => {
    if (!FocusLock) return undefined;
    const check = () => void notificationsAllowed().then(setAllowed);
    check();
    // Granting can happen in Settings, so it's checked again on the way back.
    const sub = AppState.addEventListener('change', (next) => next === 'active' && check());
    return () => sub.remove();
  }, []);
  return allowed;
}

// The line under the app name in the notification: "Read 20 pages".
const detailOf = (row: TodayRow) =>
  [row.title, row.target ? `${row.target}${row.unit ? ` ${row.unit.toLowerCase()}` : ''}` : null]
    .filter(Boolean)
    .join(' ');

// How long pinning gets to take hold before the app says it's off.
const PIN_GRACE_MS = 8000;

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
  const notifications = useNotificationPermission();
  const lockReady = notifications !== false;
  // Whether Android pinned the screen this run, and whether it's off on this phone.
  const pinned = useRef(false);
  const [pinningOff, setPinningOff] = useState(false);
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

  // The phone follows the timer: pinned while it runs, so it never leaves the app; unpinned
  // while paused and for every question. The countdown stays in the notification until the
  // end, and everything comes off when this screen goes.
  useEffect(() => {
    if (!FocusLock) return;
    if (state.phase === 'running' && state.endsAt !== null) {
      FocusLock.start(row.habit_id, row.title, detailOf(row), state.minutes, state.endsAt);
      pinned.current = FocusLock.isPinned();
      if (!pinned.current) FocusLock.pin();
    } else if (state.phase === 'paused') {
      FocusLock.pause(state.remainingMs);
      pinned.current = false;
      FocusLock.unpin();
    } else if (state.phase !== 'setup') {
      FocusLock.stop();
      pinned.current = false;
      FocusLock.unpin();
    }
  }, [state.phase, state.endsAt, state.remainingMs, state.minutes, row]);
  useEffect(
    () => () => {
      FocusLock?.stop();
      FocusLock?.unpin();
    },
    []
  );

  // Pinning that never takes hold is off on this phone; one taken away by Android's unpin
  // gesture is someone choosing to leave, which is Stop.
  useEffect(() => {
    if (!FocusLock || state.phase !== 'running') return undefined;
    const started = Date.now();
    const watch = setInterval(() => {
      const now = FocusLock!.isPinned();
      if (now) {
        pinned.current = true;
        setPinningOff(false);
      } else if (pinned.current) {
        pinned.current = false;
        dispatch({ type: 'stop', now: Date.now() });
      } else if (Date.now() - started > PIN_GRACE_MS) {
        setPinningOff(true);
      }
    }, TICK_MS);
    return () => clearInterval(watch);
  }, [state.phase]);

  // Pause and Resume from the notification: the phone's copy says what happened.
  useEffect(() => {
    if (!FocusLock || (state.phase !== 'running' && state.phase !== 'paused')) return undefined;
    const watch = setInterval(() => {
      const saved = FocusLock!.status();
      if (!saved) return;
      if (saved.paused && state.phase === 'running') dispatch({ type: 'pause', now: Date.now() });
      if (!saved.paused && state.phase === 'paused') dispatch({ type: 'resume', now: Date.now() });
    }, TICK_MS);
    return () => clearInterval(watch);
  }, [state.phase]);

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

  // Stop and Done tapped in the notification.
  useEffect(
    () =>
      onFocusCommand((command) => {
        if (command === 'done') done();
        else stop();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
      {notifications === false ? (
        <View style={[styles.permissions, { borderColor: colors.border }]}>
          <Text>To show the countdown in your notifications and on the lock screen, allow notifications.</Text>
          <Button label="Allow notifications" quiet onPress={() => void askForNotifications()} />
        </View>
      ) : null}
      {FocusLock ? (
        <Text variant="small" muted>
          While it runs, your phone stays on Tunnel Vision. Calls and emergency calls always get through.
        </Text>
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
            {pinningOff && state.phase === 'running' ? (
              <View style={styles.section}>
                <Text variant="small" muted accessibilityLiveRegion="polite">
                  Your phone isn&apos;t pinned, so other apps can still open. Pin it to stay on Tunnel Vision. If it
                  doesn&apos;t ask, turn on App pinning in Settings.
                </Text>
                <Button label="Pin again" quiet onPress={() => FocusLock?.pin()} />
                <Button label="Open pinning settings" quiet onPress={() => FocusLock?.openPinningSettings()} />
              </View>
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
