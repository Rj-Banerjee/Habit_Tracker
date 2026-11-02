import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  cardDetail,
  cardStatus,
  coachCard,
  dayPart,
  eveningNote,
  greeting,
  groupByIdentity,
  HabitLevel,
  isLogged,
  layout,
  progressLabel,
  repairOnLabel,
  RepairRow,
  showYesterdayFirst,
  space,
  TodayRow,
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
import { CoachCard } from '../coach/CoachCard';
import { CoachDrawer } from '../coach/CoachDrawer';
import { useActions } from '../hooks/useActions';
import { useCoach } from '../hooks/useCoach';
import { useToday } from '../hooks/useToday';
import { useVoice } from '../hooks/useVoice';
import { checkOffTick } from '../services/haptics';
import { ShrinkSheet } from '../today/ShrinkSheet';
import { SwipeToSkip } from '../today/SwipeToSkip';
import { UndoBanner } from '../voice/UndoBanner';
import { VoiceSheet } from '../voice/VoiceSheet';

// iOS drops a sheet opened while another is still closing.
const SHEET_CLOSE_MS = 400;

interface TodayScreenProps {
  onAddHabit: (title?: string) => void;
  onEditHabit: (habitId: string) => void;
}

export function TodayScreen({ onAddHabit, onEditHabit }: TodayScreenProps) {
  const { colors } = useTheme();
  const { rows, repairs, loading, loadFailed, message, refresh, log, undo, skip, repair } =
    useToday();
  const size = useLayoutSize();
  const [shrinkRow, setShrinkRow] = useState<TodayRow | null>(null);
  const [skipRow, setSkipRow] = useState<TodayRow | null>(null);
  const [panel, setPanel] = useState<'coach' | 'voice' | null>(null);
  const actions = useActions(rows, refresh);
  const coach = useCoach(actions);
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
  });

  const part = dayPart(new Date().getHours());
  const today = rows.filter((row) => row.is_today);
  const yesterday = rows.filter((row) => !row.is_today);

  const refreshNow = useCallback(() => {
    refresh();
  }, [refresh]);

  const tap = (row: TodayRow) => (isLogged(row) ? undo(row) : log(row, 'full'));

  const renderCard = (row: TodayRow) => (
    <SwipeToSkip
      key={`${row.habit_id}-${row.day}`}
      enabled={!isLogged(row)}
      onSkip={() => setSkipRow(row)}
    >
      <HabitCard
        title={row.title}
        status={cardStatus(row)}
        identity={row.colour_token}
        streak={row.current_streak}
        detail={cardDetail(row)}
        onPress={() => tap(row)}
        onLongPress={() => setShrinkRow(row)}
        onSkip={() => setSkipRow(row)}
        onCheckOff={checkOffTick}
      />
    </SwipeToSkip>
  );

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
            <Button label="Ask coach" quiet onPress={() => setPanel('coach')} />
          </View>
        </View>

        {card && !loading ? (
          <CoachCard
            text={card.text}
            onPress={() => {
              setPanel('coach');
              void coach.send(card.prompt, 'card');
            }}
          />
        ) : null}

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
      />
      <SkipSheet
        visible={skipRow !== null}
        onClose={() => setSkipRow(null)}
        onSkip={(reason) => {
          if (skipRow) skip(skipRow, reason);
          setSkipRow(null);
        }}
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
