import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  coachCard,
  dayPart,
  FOCUS_LINK,
  localDate,
  eveningNote,
  greeting,
  groupByIdentity,
  HABIT_TIP_TEXT,
  HabitLevel,
  isLogged,
  lockedMessage,
  layout,
  progressLabel,
  repairOnLabel,
  RepairRow,
  showYesterdayFirst,
  space,
  TodayRow,
  VOICE_LINK,
} from '@habit-tracker/core';
import {
  Button,
  HabitCard,
  SkipSheet,
  Text,
  useLayoutSize,
  useShortcut,
  useTheme,
} from '@habit-tracker/ui';
import { repairHabitOf } from '../chain/CardChain';
import { useMotionSettings } from '../chain/useMotionSettings';
import { WelcomeBack } from '../chain/WelcomeBack';
import { FocusLock, FocusSession } from '../../modules/focus-lock';
import { FocusMode } from '../focus/FocusMode';
import { offlineTracker } from '../services/logQueue';
import { syncHabitReminders } from '../services/reminders';
import { CoachCard } from '../coach/CoachCard';
import { CoachDrawer } from '../coach/CoachDrawer';
import { MissReview } from '../coach/MissReview';
import { RuleCard, TipCard } from '../components/RuleCard';
import { useActions } from '../hooks/useActions';
import { useChains } from '../hooks/useChains';
import { useCoach } from '../hooks/useCoach';
import { useEntitlements } from '../hooks/useEntitlements';
import { useHabitTip } from '../hooks/useHabitTip';
import { useMoments } from '../hooks/useMoments';
import { useNudges } from '../hooks/useNudges';
import { useRuleCard } from '../hooks/useRuleCard';
import { useToday } from '../hooks/useToday';
import { useVoice } from '../hooks/useVoice';
import { ShrinkSheet } from '../today/ShrinkSheet';
import { SwipeToSkip } from '../today/SwipeToSkip';
import { TodayCard } from '../today/TodayCard';
import { HabitDetailScreen } from './HabitDetailScreen';
import { UndoBanner } from '../voice/UndoBanner';
import { VoiceSheet } from '../voice/VoiceSheet';

// iOS drops a sheet opened while another is still closing.
const SHEET_CLOSE_MS = 400;

interface TodayScreenProps {
  onAddHabit: (title?: string) => void;
  onEditHabit: (habitId: string) => void;
  onOpenReview: () => void;
}

export function TodayScreen({ onAddHabit, onEditHabit, onOpenReview }: TodayScreenProps) {
  const { colors } = useTheme();
  const { rows, repairs, loading, loadFailed, message, refresh, log, undo, skip, repair } =
    useToday();
  const size = useLayoutSize();
  const [shrinkRow, setShrinkRow] = useState<TodayRow | null>(null);
  const [skipRow, setSkipRow] = useState<TodayRow | null>(null);
  const [panel, setPanel] = useState<'coach' | 'voice' | 'miss' | null>(null);
  const actions = useActions(rows, refresh);
  const coach = useCoach(actions);
  const { can } = useEntitlements();
  const coachLocked = can('ai.coach') ? undefined : lockedMessage('ai.coach');
  useNudges(rows, loading, refresh, can('ai.nudges'));
  const ruleCard = useRuleCard(rows, repairs, loading);
  const habitTip = useHabitTip(rows);
  // Whenever Today changes, a done habit stops reminding and a new one starts.
  useEffect(() => {
    if (!loading) void syncHabitReminders();
  }, [rows, loading]);
  const { chains, ready: chainsReady } = useChains(rows);
  const moments = useMoments(chains, chainsReady && !loading);
  const motionSettings = useMotionSettings();
  const [detailRow, setDetailRow] = useState<TodayRow | null>(null);
  // Tunnel Vision follows the live row, so a log shows on its card straight away.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusSaved, setFocusSaved] = useState<FocusSession | null>(null);
  const focusRow = focusId ? rows.find((r) => r.is_today && r.habit_id === focusId) ?? null : null;
  const openFocus = (habitId: string) => {
    setFocusSaved(null);
    setFocusId(habitId);
  };

  // A session kept going with the app closed comes back on open, from its notification,
  // or when the lock brings the app to the front.
  const resumeFocus = useCallback(() => {
    // Today has to know its habits first, or a session can't be matched to one.
    if (loading) return;
    const saved = FocusLock?.status();
    if (!saved) return;
    if (rows.some((r) => r.is_today && r.habit_id === saved.habitId)) {
      setFocusSaved(saved);
      setFocusId(saved.habitId);
    } else {
      // Done from the notification while the app was closed, for a day that has since
      // moved on: it's still logged, for the day the session was on.
      if (saved.pending === 'done') {
        const day = localDate(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date(saved.endAt - saved.minutes * 60_000));
        void offlineTracker.logHabit(saved.habitId, day, 'full', null, 'notification').catch(() => {});
      }
      // Never leave the phone locked behind a habit that isn't on screen.
      FocusLock?.stop();
    }
  }, [rows, loading]);
  useEffect(() => {
    if (focusId) return undefined;
    // After this render, so restoring a session never sets state in the middle of one.
    void Promise.resolve().then(resumeFocus);
    const sub = AppState.addEventListener('change', (next) => next === 'active' && resumeFocus());
    return () => sub.remove();
  }, [focusId, resumeFocus]);
  const chainOf = (habitId: string) => chains.find((c) => c.habitId === habitId)?.chain;
  const switching = useRef<ReturnType<typeof setTimeout> | null>(null);

  const switchTo = (next: 'coach' | 'voice', then?: () => void) => {
    setPanel(null);
    if (switching.current) clearTimeout(switching.current);
    switching.current = setTimeout(() => {
      setPanel(next);
      then?.();
    }, SHEET_CLOSE_MS);
  };

  const voice = useVoice({
    rows,
    actions,
    refresh,
    onClose: () => setPanel(null),
    onAskCoach: (question) => switchTo('coach', () => void coach.send(question)),
    canUseAi: can('ai.voice'),
  });

  const resumeFocusRef = useRef(resumeFocus);
  useEffect(() => {
    resumeFocusRef.current = resumeFocus;
  }, [resumeFocus]);

  // The widget's voice button opens straight to the sheet.
  useEffect(() => {
    const opened = (url: string | null | undefined) => {
      if (url === VOICE_LINK) setPanel('voice');
      if (url?.includes(`://${FOCUS_LINK}`)) resumeFocusRef.current();
    };
    Linking.getInitialURL()
      .then(opened)
      .catch(() => {});
    const links = Linking.addEventListener('url', ({ url }) => opened(url));
    return () => links.remove();
  }, []);

  const part = dayPart(new Date().getHours());
  const today = rows.filter((row) => row.is_today);
  const yesterday = rows.filter((row) => !row.is_today);

  const refreshNow = useCallback(() => {
    refresh();
  }, [refresh]);

  const tap = (row: TodayRow) => {
    // A tap never waits for an animation: it jumps to the end and logs.
    moments.interrupt(row.habit_id);
    return isLogged(row) ? undo(row) : log(row, 'full');
  };

  const renderCard = (row: TodayRow) => (
    <SwipeToSkip
      key={`${row.habit_id}-${row.day}`}
      enabled={!isLogged(row)}
      onSkip={() => setSkipRow(row)}
    >
      <TodayCard
        row={row}
        chain={row.is_today ? chainOf(row.habit_id) : undefined}
        playing={row.is_today ? moments.playing[row.habit_id] : undefined}
        settings={motionSettings}
        onPress={() => tap(row)}
        onLongPress={() => {
          moments.interrupt(row.habit_id);
          setShrinkRow(row);
        }}
        onSkip={() => setSkipRow(row)}
        onMomentFinish={() => moments.finish(row.habit_id)}
        onOpenDetail={() => {
          moments.interrupt(row.habit_id);
          setDetailRow(row);
        }}
        onFocus={row.is_today ? () => openFocus(row.habit_id) : undefined}
      />
    </SwipeToSkip>
  );

  const welcomeHabits = today.flatMap((row) => {
    const chain = chainOf(row.habit_id);
    return chain ? [{ habitId: row.habit_id, identity: row.colour_token, chain, ...repairHabitOf(row) }] : [];
  });

  useShortcut('r', refreshNow);

  const card = coachCard(rows, repairs, part);

  const repairSection =
    repairs.length > 0 ? (
      <View style={styles.group}>
        <Text variant="small" muted accessibilityRole="header">
          Can still be repaired
        </Text>
        {repairs.map((row: RepairRow) => (
          <HabitCard
            key={row.habit_id}
            title={row.title}
            status="missed"
            statusLabel={repairOnLabel(row.repair_on)}
            identity={row.colour_token}
            streak={row.current_streak}
          />
        ))}
      </View>
    ) : null;

  const yesterdaySection =
    yesterday.length > 0 ? (
      <View style={styles.group}>
        <Text variant="small" muted accessibilityRole="header">
          Still open from yesterday
        </Text>
        {yesterday.map(renderCard)}
      </View>
    ) : null;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={[styles.content, size !== 'compact' && styles.contentWide]}>
        <View style={styles.header}>
          <Text variant="small" muted>
            {greeting(part)}
          </Text>
          <Text variant="title" accessibilityRole="header" numeric>
            {progressLabel(today) || 'Today'}
          </Text>
          {part === 'evening' && eveningNote(today) ? (
            <Text variant="small" muted numeric>
              {eveningNote(today)}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label="Log by voice"
              quiet
              onPress={() => {
                voice.reset();
                setPanel('voice');
              }}
            />
          </View>
          <View style={styles.action}>
            <Button label="Ask coach" quiet disabled={Boolean(coachLocked)} onPress={() => setPanel('coach')} />
          </View>
        </View>
        {coachLocked ? (
          <Text variant="small" muted>
            Coach · {coachLocked}
          </Text>
        ) : null}

        {card && !loading ? (
          <CoachCard
            text={card.text}
            locked={coachLocked}
            onPress={() => {
              if (card.opens === 'sunday') {
                onOpenReview();
              } else if (card.opens === 'miss') {
                setPanel('miss');
              } else {
                setPanel('coach');
                void coach.send(card.prompt, 'card');
              }
            }}
          />
        ) : null}

        {moments.welcomeBack.length > 0 ? (
          <WelcomeBack
            moments={moments.welcomeBack}
            habits={welcomeHabits}
            onDismiss={moments.dismissWelcomeBack}
          />
        ) : null}

        {ruleCard.rule ? <RuleCard rule={ruleCard.rule} onDismiss={ruleCard.dismiss} /> : null}

        {habitTip.show ? <TipCard text={HABIT_TIP_TEXT} onDismiss={habitTip.dismiss} /> : null}

        {message ? (
          <Text variant="small" muted accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading your habits" />
        ) : loadFailed ? (
          <View style={styles.notice}>
            <Text>Your habits couldn&apos;t load.</Text>
            <Button label="Try again" onPress={refresh} />
          </View>
        ) : rows.length === 0 && repairs.length === 0 ? (
          <View style={styles.notice}>
            <Text>Nothing is due today.</Text>
            <Text variant="small" muted>
              Habits you add will show up here on the days they&apos;re scheduled.
            </Text>
            <Button label="Add habit" onPress={() => onAddHabit()} />
          </View>
        ) : (
          <>
            {showYesterdayFirst(part) ? yesterdaySection : null}
            {groupByIdentity(today).map((group) => (
              <View key={group.identityId} style={styles.group}>
                <Text variant="small" muted accessibilityRole="header">
                  {group.name}
                </Text>
                {group.rows.map(renderCard)}
              </View>
            ))}
            {showYesterdayFirst(part) ? null : yesterdaySection}
            {repairSection}
            <Button label="Add habit" quiet onPress={() => onAddHabit()} />
          </>
        )}
      </ScrollView>

      {voice.banner ? (
        <UndoBanner banner={voice.banner} onUndo={voice.undo} onExpire={voice.clearBanner} />
      ) : null}

      <ShrinkSheet
        row={shrinkRow}
        onClose={() => setShrinkRow(null)}
        onLog={(row: TodayRow, level: HabitLevel) => {
          setShrinkRow(null);
          log(row, level);
        }}
        onRepair={(row) => {
          setShrinkRow(null);
          repair(row);
        }}
        onSkip={(row) => {
          setShrinkRow(null);
          setSkipRow(row);
        }}
        onEdit={(row) => {
          setShrinkRow(null);
          onEditHabit(row.habit_id);
        }}
        onDetails={(row) => {
          setShrinkRow(null);
          setDetailRow(row);
        }}
        onFocus={(row) => {
          setShrinkRow(null);
          openFocus(row.habit_id);
        }}
      />
      <SkipSheet
        visible={skipRow !== null}
        onClose={() => setSkipRow(null)}
        onSkip={(reason) => {
          if (skipRow) skip(skipRow, reason);
          setSkipRow(null);
        }}
      />
      <MissReview
        visible={panel === 'miss'}
        repair={repairs[0] ?? null}
        onChoose={(reason, label) => {
          switchTo('coach', () =>
            void coach.send(`${repairs[0]?.title} slipped. ${label}.`, 'miss_review', reason)
          );
        }}
        onClose={() => setPanel(null)}
      />
      <VoiceSheet
        visible={panel === 'voice'}
        voice={voice}
        onAddHabit={(title) => {
          setPanel(null);
          voice.reset();
          onAddHabit(title);
        }}
        onClose={() => setPanel(null)}
      />
      <CoachDrawer
        visible={panel === 'coach'}
        coach={coach}
        onQuickLog={() => {
          voice.reset();
          switchTo('voice');
        }}
        onCreateHabit={(title) => {
          setPanel(null);
          onAddHabit(title);
        }}
        onClose={() => setPanel(null)}
      />
      {focusRow ? (
        <FocusMode
          key={focusRow.habit_id}
          row={focusRow}
          saved={focusSaved}
          reducedMotion={motionSettings.reducedMotion}
          onLog={log}
          onClose={() => setFocusId(null)}
        />
      ) : null}
      {detailRow ? (
        <HabitDetailScreen
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onEdit={() => {
            setDetailRow(null);
            onEditHabit(detailRow.habit_id);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    gap: space.xl,
    width: '100%',
    maxWidth: layout.readingWidth,
    alignSelf: 'center',
    padding: space.lg,
  },
  contentWide: { paddingTop: space.xxl },
  header: { gap: space.xs, paddingTop: space.lg },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
  group: { gap: space.sm },
  notice: { gap: space.md },
});
