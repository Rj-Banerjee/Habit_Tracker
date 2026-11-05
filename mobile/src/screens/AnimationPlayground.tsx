import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  buildChain,
  Chain,
  DayStatus,
  isLowEnd,
  Moment,
  MomentKind,
  radius,
  space,
  TodayRow,
} from '@habit-tracker/core';
import { Button, Chip, HabitCard, StreakChain, Text, ThemeProvider, useTheme } from '@habit-tracker/ui';
import * as Device from 'expo-device';
import { captionsFor, streakBeforeWeld, useCountUp } from '../chain/CardChain';
import { MomentChain } from '../chain/MomentChain';
import { WelcomeBack } from '../chain/WelcomeBack';
import { FocusMode } from '../focus/FocusMode';

// A fixed week, so every moment can be reviewed without real data. Thursday 12 Nov.
const TODAY = '2026-11-12';
const MISSED = '2026-11-10';

function sampleDays(missedAs: string, repairOn: string | null = null): DayStatus[] {
  return Array.from({ length: 11 }, (_, i) => {
    const date = `2026-11-${String(i + 2).padStart(2, '0')}`;
    const status = date === MISSED ? missedAs : date === TODAY ? 'pending' : 'done';
    return { habit_id: 'sample', date, status, repair_on: date === MISSED ? repairOn : null };
  });
}

const SAMPLES: Record<MomentKind, Chain> = {
  fracture: buildChain(sampleDays('missed', '2026-11-11'), [], TODAY),
  weld: buildChain(sampleDays('repaired'), [{ date: '2026-11-11', level_done: 'full', amount: 45 }], TODAY),
  protected: buildChain(sampleDays('protected'), [], TODAY),
};

const row = {
  habit_id: 'sample',
  day: TODAY,
  is_today: true,
  title: 'Read',
  habit_type: 'count',
  target: 30,
  unit: 'pages',
  current_streak: 12,
  colour_token: 'identity-1',
  status: 'pending',
} as TodayRow;

// Every node state and link kind, still, for checking against the card marks.
const GALLERY: { label: string; chain: Chain }[] = [
  {
    label: 'Done, minimum, skipped, protected, repaired, not done, due',
    chain: buildChain(
      [
        { habit_id: 's', date: '2026-11-06', status: 'done', repair_on: null },
        { habit_id: 's', date: '2026-11-07', status: 'done', repair_on: null },
        { habit_id: 's', date: '2026-11-08', status: 'skipped', repair_on: null },
        { habit_id: 's', date: '2026-11-09', status: 'protected', repair_on: null },
        { habit_id: 's', date: '2026-11-10', status: 'repaired', repair_on: null },
        { habit_id: 's', date: '2026-11-11', status: 'missed', repair_on: null },
        { habit_id: 's', date: '2026-11-12', status: 'pending', repair_on: null },
      ],
      [{ date: '2026-11-07', level_done: 'minimum' }],
      TODAY
    ),
  },
  { label: 'A crack that can still be repaired', chain: SAMPLES.fracture },
];

interface Run {
  kind: MomentKind;
  id: number;
}

function Stage({ settings, run, onFrames }: {
  settings: { reducedMotion: boolean; lowEnd: boolean; slow: number };
  run: Run | null;
  onFrames: (fps: number, dropped: number) => void;
}) {
  const { colors } = useTheme();
  const [interrupted, setInterrupted] = useState(false);
  const count = useCountUp(row.current_streak);
  const kind = run?.kind ?? 'fracture';
  const chain = SAMPLES[kind];
  const moment: Moment = { kind, habitId: 'sample', date: MISSED };
  const playing = { moment, finished: false, interrupted };

  return (
    <View style={[styles.stage, { backgroundColor: colors.canvas }]}>
      <HabitCard
        title={row.title}
        status="due"
        identity="identity-1"
        streak={count.shown ?? row.current_streak}
        detail="30 pages"
        // Tapping the card mid-way shows interruption: it jumps to the end.
        onPress={() => setInterrupted(true)}
        footer={
          run ? (
            <MomentChain
              key={run.id}
              chain={chain}
              moment={moment}
              identity="identity-1"
              settings={settings}
              captions={captionsFor(playing, chain, row)}
              interrupted={interrupted}
              onSeam={kind === 'weld' ? () => count.start(streakBeforeWeld(chain, MISSED)) : undefined}
              onFrames={onFrames}
            />
          ) : (
            <StreakChain chain={SAMPLES.fracture} identity="identity-1" />
          )
        }
      />
    </View>
  );
}

export function AnimationPlayground() {
  const [dark, setDark] = useState(false);
  const [slow, setSlow] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const detectedLowEnd = isLowEnd(Device.totalMemory);
  const [lowEnd, setLowEnd] = useState(detectedLowEnd);
  const [run, setRun] = useState<Run | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [frames, setFrames] = useState<string | null>(null);
  // Tunnel Vision on a sample habit, including the phone lock. Nothing is logged.
  const [focusing, setFocusing] = useState(false);

  const settings = useMemo(() => ({ reducedMotion, lowEnd, slow: slow ? 4 : 1 }), [reducedMotion, lowEnd, slow]);
  const play = (kind: MomentKind) => {
    setFrames(null);
    setWelcome(false);
    setRun({ kind, id: Date.now() });
  };

  const memory = Device.totalMemory ? `${(Device.totalMemory / 1024 ** 3).toFixed(1)} GB` : 'unknown';

  return (
    <ThemeProvider forced={dark ? 'dark' : 'light'}>
      <PlaygroundBody>
        <Text variant="title" accessibilityRole="header">
          Animation playground
        </Text>
        <Text variant="small" muted>
          Tap the card while a moment plays to interrupt it.
        </Text>

        <View style={styles.wrap}>
          <Button label="Fracture" onPress={() => play('fracture')} />
          <Button label="Weld" onPress={() => play('weld')} />
          <Button label="Protected" onPress={() => play('protected')} />
          <Button label="Welcome back" quiet onPress={() => setWelcome(true)} />
          <Button label="Tunnel Vision" quiet onPress={() => setFocusing(true)} />
        </View>

        <View style={styles.wrap}>
          <Chip label="0.25x slow motion" selected={slow} onPress={() => setSlow(!slow)} />
          <Chip label="Reduced motion" selected={reducedMotion} onPress={() => setReducedMotion(!reducedMotion)} />
          <Chip label="Dark" selected={dark} onPress={() => setDark(!dark)} />
          <Chip label="Low-end (no sparks)" selected={lowEnd} onPress={() => setLowEnd(!lowEnd)} />
        </View>

        <Stage key={run?.id ?? 'still'} settings={settings} run={run} onFrames={(fps, dropped) => setFrames(`${fps} fps on the UI thread, ${dropped} long frames`)} />

        <Text variant="small" muted numeric>
          {frames ?? 'Play a moment to measure its frame rate.'}
        </Text>
        <Text variant="small" muted numeric>
          This phone: {memory}, so it counts as {detectedLowEnd ? 'low-end' : 'not low-end'}.
        </Text>

        {welcome ? (
          <WelcomeBack
            moments={[
              { kind: 'fracture', habitId: 'a', date: MISSED },
              { kind: 'protected', habitId: 'b', date: MISSED },
            ]}
            habits={[
              { habitId: 'a', identity: 'identity-1', chain: SAMPLES.fracture, title: 'Read', type: 'count', target: 30, unit: 'pages' },
              { habitId: 'b', identity: 'identity-4', chain: SAMPLES.protected, title: 'Meditate', type: 'boolean', target: null, unit: null },
            ]}
            onDismiss={() => setWelcome(false)}
          />
        ) : null}

        <Text variant="title">Every state, still</Text>
        {GALLERY.map((item) => (
          <View key={item.label} style={styles.gallery}>
            <Text variant="small" muted>
              {item.label}
            </Text>
            <StreakChain chain={item.chain} identity="identity-1" />
          </View>
        ))}
      </PlaygroundBody>
      {focusing ? (
        <FocusMode
          row={{ ...row, title: 'Sample habit' }}
          reducedMotion={reducedMotion}
          onLog={() => {}}
          onClose={() => setFocusing(false)}
        />
      ) : null}
    </ThemeProvider>
  );
}

function PlaygroundBody({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={styles.body}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.lg, padding: space.lg, paddingTop: space.xxl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stage: { padding: space.md, borderRadius: radius.md },
  gallery: { gap: space.xs },
});
