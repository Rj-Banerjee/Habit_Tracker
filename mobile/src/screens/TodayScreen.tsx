import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addDays,
  dayHeading,
  dayStrip,
  filterByTime,
  isoWeekday,
  reviewWeekStart,
  coachCard,
  dayPart,
  FOCUS_LINK,
  localDate,
  eveningNote,
  greeting,
  DragTarget,
  emptySectionLine,
  groupByTimeOfDay,
  TimeFilter,
  orderAfterDrop,
  radius,
  HABIT_TIP_TEXT,
  HabitLevel,
  isLogged,
  isWeekly,
  lockedMessage,
  layout,
  progressLabel,
  repairOnLabel,
  RepairRow,
  showYesterdayFirst,
  space,
  TimeOfDay,
  TodayRow,
  VOICE_LINK,
} from '@habit-tracker/core';
import {
  BottomSheet,
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
import { useWeeklyReport } from '../hooks/useWeeklyReport';
import { FinishCard } from '../chain/FinishCard';
import { WelcomeBack } from '../chain/WelcomeBack';
import { FocusLock, FocusSession } from '../../modules/focus-lock';
import { FocusMode } from '../focus/FocusMode';
import { offlineTracker } from '../services/logQueue';
import { syncHabitReminders } from '../services/reminders';
import { CoachCard } from '../coach/CoachCard';
import { CoachDrawer } from '../coach/CoachDrawer';
import { MissReview } from '../coach/MissReview';
import { ChoiceCard, RuleCard, TipCard } from '../components/RuleCard';
import { useActions } from '../hooks/useActions';
import { useChains } from '../hooks/useChains';
import { useCoach } from '../hooks/useCoach';
import { useEntitlements } from '../hooks/useEntitlements';
import { useCompletedHabits } from '../hooks/useCompletedHabits';
import { useCheckin } from '../hooks/useCheckin';
import { useTodayAi } from '../hooks/useTodayAi';
import { useHabitTip } from '../hooks/useHabitTip';
import { useMoments } from '../hooks/useMoments';
import { useNudges } from '../hooks/useNudges';
import { useRuleCard } from '../hooks/useRuleCard';
import { useTimeSuggestion } from '../hooks/useTimeSuggestion';
import { useDay } from '../hooks/useDay';
import { useToday } from '../hooks/useToday';
import { useVoice } from '../hooks/useVoice';
import { AutopilotNotice, HeadsUpCard, WarningCard } from '../today/AiCards';
import { CheckinCard, CheckinOffer } from '../today/CheckinCard';
import { ShrinkSheet } from '../today/ShrinkSheet';
import { DateStrip } from '../today/DateStrip';
import { FadeSwap } from '../today/FadeSwap';
import { DayHeader } from '../today/DayHeader';
import { DragToMove } from '../today/DragToMove';
import { ChipRect, chipAt, TimeChips, TimeChipsHandle } from '../today/TimeChips';
import { useDragBoard } from '../today/useDragBoard';
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
  const { rows, repairs, loading, loadFailed, message, refresh, log, addAmount, addAmountOf, moveTo, undo, skip, repair } =
    useToday();
  const size = useLayoutSize();
  const [shrinkRow, setShrinkRow] = useState<TodayRow | null>(null);
  // A long-pressed card can be dragged to another part of the day while the finger stays down.
  const [armed, setArmed] = useState<string | null>(null);
  const board = useDragBoard(space.md);
  const [skipRow, setSkipRow] = useState<TodayRow | null>(null);
  const [panel, setPanel] = useState<'coach' | 'voice' | 'miss' | null>(null);
  const actions = useActions(rows, refresh);
  const coach = useCoach(actions);
  const { can, ready } = useEntitlements();
  const coachLocked = can('ai.coach') ? undefined : lockedMessage('ai.coach');
  useNudges(rows, loading, refresh, can('ai.nudges'));
  const ruleCard = useRuleCard(rows, repairs, loading);
  const habitTip = useHabitTip(rows);
  const checkin = useCheckin();
  const todayAi = useTodayAi(() => refresh());
  const completed = useCompletedHabits();
  const timeMove = useTimeSuggestion(rows, ready && can('ai.nudges'));
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
    onCheckin: () => void checkin.reload(),
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

  // The strip across the top: today unless another day is picked. Today's date comes from
  // the server's rows, so it follows the profile's timezone.
  const currentDay =
    today[0]?.day ??
    (yesterday[0] ? addDays(yesterday[0].day, 1) : localDate(Intl.DateTimeFormat().resolvedOptions().timeZone));
  const [picked, setPicked] = useState<string | null>(null);
  const viewing = picked !== null && picked !== currentDay ? picked : null;
  const other = useDay(viewing);
  const shownDay = viewing ?? currentDay;
  const heading = dayHeading(currentDay, shownDay);
  const [filter, setFilter] = useState<TimeFilter>('all');

  // Changing another day reloads it, after Today has had its say.
  const reloadOther = () => {
    if (viewing) void other.reload();
  };
  const thenReload = (done: unknown) => {
    void Promise.resolve(done).then(reloadOther);
  };

  const tap = (row: TodayRow) => {
    // A tap never waits for an animation: it jumps to the end and logs.
    moments.interrupt(row.habit_id);
    return thenReload(isLogged(row) ? undo(row) : log(row, 'full'));
  };

  // Today's habits by part of the day: what a drag reorders within.
  const groups = groupByTimeOfDay(today, true);
  const timeOf = (row: TodayRow): TimeOfDay => row.time_of_day ?? 'anytime';
  // A card in the list only moves among its own part of the day; a chip moves it to another.
  const orderFor = (row: TodayRow) =>
    groups.find((group) => group.time === timeOf(row))?.rows.map((r) => `card:${r.habit_id}`) ?? [];

  // The chips, measured as a drag starts, so a card can be dropped on one.
  const chipsRef = useRef<TimeChipsHandle>(null);
  const chipRects = useRef<ChipRect[]>([]);
  const [chipTarget, setChipTarget] = useState<TimeFilter | null>(null);
  const chipUnder = (row: TodayRow, x: number, y: number) => {
    const chip = chipAt(chipRects.current, x, y);
    return chip && chip !== 'all' && chip !== timeOf(row) ? chip : null;
  };

  // Where the card landed in its part of the day, saved.
  const land = (row: TodayRow, target: DragTarget | null) => {
    setArmed(null);
    const section = groups.find((group) => group.time === target?.time);
    if (!target || !section) return board.settle();
    const before = section.rows.map((r) => r.habit_id);
    const order = orderAfterDrop(before, row.habit_id, target.index);
    if (order.join() === before.join()) return board.settle();
    void moveTo(row, target.time, order);
    // The new order is drawn first, then the cards drop their offsets, so nothing jumps.
    requestAnimationFrame(() => requestAnimationFrame(board.settle));
  };

  const renderCard = (row: TodayRow) => {
    // A day still to come, or past its back-log window, is there to look at.
    const readOnly = row.can_change === false;
    return (
      <DragToMove
        key={`${row.habit_id}-${row.day}`}
        armed={row.is_today && !viewing && armed === row.habit_id}
        offset={board.offsetOf(row.is_today && !viewing ? `card:${row.habit_id}` : `past:${row.habit_id}-${row.day}`)}
        onLayout={(y, height) =>
          row.is_today && !viewing && board.place(`card:${row.habit_id}`, { kind: 'card', time: timeOf(row), y, height })
        }
        onDragStart={() => {
          setShrinkRow(null);
          board.start(`card:${row.habit_id}`);
          void chipsRef.current?.measure().then((rects) => (chipRects.current = rects));
        }}
        onMove={(dy, x, y) => {
          const chip = chipUnder(row, x, y);
          setChipTarget((current) => (current === chip ? current : chip));
          board.move(`card:${row.habit_id}`, chip ? 0 : dy, orderFor(row));
        }}
        onDrop={(dy, x, y) => {
          setChipTarget(null);
          const chip = chipUnder(row, x, y);
          if (chip) {
            // Onto another part of the day: it goes to the end of that part.
            setArmed(null);
            board.cancel();
            void moveTo(row, chip);
            return;
          }
          board.drop(`card:${row.habit_id}`, dy, orderFor(row), (target) => land(row, target));
        }}
        onCancel={() => {
          setArmed(null);
          setChipTarget(null);
          board.cancel();
        }}
        onDisarm={() => setArmed(null)}
      >
        <SwipeToSkip enabled={!readOnly && !isLogged(row) && !isWeekly(row)} onSkip={() => setSkipRow(row)}>
          <TodayCard
            row={row}
            readOnly={readOnly}
            chain={row.is_today ? chainOf(row.habit_id) : undefined}
            playing={row.is_today ? moments.playing[row.habit_id] : undefined}
            settings={motionSettings}
            onPress={() => {
              if (!readOnly) tap(row);
            }}
            onLongPress={() => {
              if (readOnly) return;
              moments.interrupt(row.habit_id);
              setArmed(row.habit_id);
              setShrinkRow(row);
            }}
            onSkip={isWeekly(row) || readOnly ? undefined : () => setSkipRow(row)}
            onMomentFinish={() => moments.finish(row.habit_id)}
            onOpenDetail={() => {
              moments.interrupt(row.habit_id);
              setDetailRow(row);
            }}
            onFocus={row.is_today && !viewing ? () => openFocus(row.habit_id) : undefined}
          />
        </SwipeToSkip>
      </DragToMove>
    );
  };

  const welcomeHabits = today.flatMap((row) => {
    const chain = chainOf(row.habit_id);
    return chain ? [{ habitId: row.habit_id, identity: row.colour_token, chain, ...repairHabitOf(row) }] : [];
  });

  useShortcut('r', refreshNow);

  // On Sundays, the card that opens the Sunday Review leads with the week's numbers.
  const todayDate = today[0]?.day ?? '';
  const sunday = todayDate !== '' && isoWeekday(todayDate) === 7;
  const report = useWeeklyReport(sunday ? reviewWeekStart(todayDate) : '');
  const card = coachCard(rows, repairs, part, report?.headline);

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

  const yesterdayShown = filterByTime(yesterday, filter);
  const yesterdaySection =
    yesterdayShown.length > 0 ? (
      <View style={styles.group}>
        <Text variant="small" muted accessibilityRole="header">
          Still open from yesterday
        </Text>
        {yesterdayShown.map(renderCard)}
      </View>
    ) : null;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.canvas }]}>
      <ScrollView
        scrollEnabled={board.dragged === null}
        // The chips stay in reach while the list scrolls, as somewhere to drop a card.
        stickyHeaderIndices={[1]}
        contentContainerStyle={[styles.content, size !== 'compact' && styles.contentWide]}
      >
        <View style={styles.top}>
          <DayHeader title={heading.title} subtitle={heading.subtitle} onAdd={() => onAddHabit()}>
            {viewing ? (
              other.rows.length > 0 ? (
                <Text variant="small" muted numeric>
                  {progressLabel(other.rows)}
                </Text>
              ) : null
            ) : (
              <>
                <Text variant="small" muted numeric>
                  {[greeting(part), progressLabel(today)].filter(Boolean).join(' · ')}
                </Text>
                {part === 'evening' && eveningNote(today) ? (
                  <Text variant="small" muted numeric>
                    {eveningNote(today)}
                  </Text>
                ) : null}
              </>
            )}
          </DayHeader>
          <DateStrip
            days={dayStrip(currentDay, shownDay)}
            marked={yesterday.length > 0 ? [yesterday[0].day] : []}
            onSelect={(day) => setPicked(day === currentDay ? null : day)}
          />
        </View>

        <View style={[styles.chips, { backgroundColor: colors.canvas }]}>
          <TimeChips
            ref={chipsRef}
            active={filter}
            onChange={setFilter}
            target={chipTarget}
            reducedMotion={motionSettings.reducedMotion}
          />
        </View>

        {viewing ? null : (
        <>
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

        {todayAi.unseen.length > 0 ? (
          <AutopilotNotice
            changes={todayAi.unseen}
            onUndo={(id) => void todayAi.undoAutopilot(id)}
            onKeep={todayAi.keepAutopilot}
          />
        ) : null}
        {todayAi.headsUp ? (
          <HeadsUpCard
            headsUp={todayAi.headsUp}
            onApply={() => void todayAi.applyHeadsUp()}
            onDismiss={todayAi.dismissHeadsUp}
          />
        ) : null}
        {todayAi.warning ? <WarningCard warning={todayAi.warning} onSnooze={todayAi.snoozeWarning} /> : null}
        {todayAi.problem ? (
          <Text variant="small" muted accessibilityLiveRegion="polite">
            {todayAi.problem}
          </Text>
        ) : null}

        {checkin.askToTurnOff ? (
          <CheckinOffer onKeep={() => void checkin.answerOffer(true)} onTurnOff={() => void checkin.answerOffer(false)} />
        ) : null}

        {ruleCard.rule ? <RuleCard rule={ruleCard.rule} onDismiss={ruleCard.dismiss} /> : null}

        {habitTip.show ? <TipCard text={HABIT_TIP_TEXT} onDismiss={habitTip.dismiss} /> : null}

        {timeMove.move ? (
          <ChoiceCard
            text={timeMove.move.text}
            yes="Move"
            no="Keep"
            onYes={() => {
              const move = timeMove.move;
              const row = move && today.find((r) => r.habit_id === move.habitId);
              if (move && row) void moveTo(row, move.to);
            }}
            onNo={timeMove.keep}
          />
        ) : null}

        {completed.celebrate ? (
          <FinishCard
            key={completed.celebrate.habit_id}
            habit={completed.celebrate}
            onDismiss={() => completed.celebrate && completed.dismiss(completed.celebrate)}
          />
        ) : null}

        </>
        )}

        {message ? (
          <Text variant="small" muted accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}

        {viewing ? (
          other.loading ? (
            <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading that day" />
          ) : other.failed ? (
            <View style={styles.notice}>
              <Text>That day couldn&apos;t load.</Text>
              <Button label="Try again" onPress={() => void other.reload()} />
            </View>
          ) : (
            <FadeSwap swapKey={`${shownDay}:${filter}`} reducedMotion={motionSettings.reducedMotion} style={styles.group}>
              {other.rows.length === 0 ? (
                <Text variant="small" muted>
                  {viewing > currentDay ? 'Nothing is scheduled that day.' : 'Nothing was due that day.'}
                </Text>
              ) : (
                <>
                  {other.rows.some((r) => r.can_change === false) ? (
                    <Text variant="small" muted>
                      {viewing > currentDay
                        ? 'Still to come, so nothing can be logged yet.'
                        : 'Past its back-log window, so this day is view only.'}
                    </Text>
                  ) : null}
                  {filterByTime(other.rows, filter).map(renderCard)}
                  {filter !== 'all' && filterByTime(other.rows, filter).length === 0 ? (
                    <EmptyLine text={emptySectionLine(filter)} />
                  ) : null}
                </>
              )}
            </FadeSwap>
          )
        ) : loading ? (
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
            <FadeSwap
              swapKey={filter}
              reducedMotion={motionSettings.reducedMotion}
              style={styles.group}
              // One list now, so every part of the day starts where it does.
              onLayout={(event) => {
                for (const group of groups) board.placeSection(group.time, event.nativeEvent.layout.y);
              }}
            >
              {filterByTime(today, filter).map(renderCard)}
              {filterByTime(today, filter).length === 0 && today.length + yesterday.length > 0 ? (
                <EmptyLine text={filter === 'all' ? 'Nothing left for today' : emptySectionLine(filter)} />
              ) : null}
            </FadeSwap>
            {showYesterdayFirst(part) ? null : yesterdaySection}
            {repairSection}
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
          thenReload(log(row, level));
        }}
        onRepair={(row) => {
          setShrinkRow(null);
          thenReload(repair(row));
        }}
        onAddAmount={async (row, text) => {
          const added = await addAmount(row, text);
          reloadOther();
          if (added) setShrinkRow(null);
          return added;
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
      {/* The day's first open: the check-in slides up, once, when nothing else is open. */}
      <BottomSheet
        visible={checkin.popupDue && !loading && panel === null && focusId === null && detailRow === null && shrinkRow === null && skipRow === null}
        title="Daily check-in"
        onClose={checkin.dismissPopup}
      >
        <CheckinCard
          bare
          existing={checkin.state?.checkin ?? null}
          problem={checkin.problem}
          onSave={(answer) => void checkin.save(answer)}
          onSkip={() => {
            checkin.dismissPopup();
            void checkin.skip();
          }}
        />
      </BottomSheet>
      <SkipSheet
        visible={skipRow !== null}
        onClose={() => setSkipRow(null)}
        onSkip={(reason) => {
          if (skipRow) thenReload(skip(skipRow, reason));
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
          onAddAmount={(row, amount) => void addAmountOf(row, amount)}
          onClose={() => setFocusId(null)}
        />
      ) : null}
      {detailRow ? (
        <HabitDetailScreen
          habitId={detailRow.habit_id}
          title={detailRow.title}
          identityName={detailRow.identity_name}
          today={detailRow.day}
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

// Where a chip has nothing under it.
function EmptyLine({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.emptySection, { borderColor: colors.border, borderRadius: radius.md }]}>
      <Text variant="small" muted>
        {text}
      </Text>
    </View>
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
  top: { gap: space.md, paddingTop: space.lg },
  // Stuck to the top while scrolling, so it covers what passes under it.
  chips: { marginHorizontal: -space.lg, paddingHorizontal: space.lg, paddingVertical: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
  emptySection: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  group: { gap: space.sm },
  notice: { gap: space.md },
});
