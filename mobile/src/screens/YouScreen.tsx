import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { completedSummary, isLogged, layout, space } from '@habit-tracker/core';
import {
  BottomSheet,
  Button,
  FormMessage,
  SegmentedControl,
  ThemePicker,
  SheetOption,
  Text,
  THEME_PREFERENCES,
  useTheme,
} from '@habit-tracker/ui';
import { WhySection } from '../coach/WhySection';
import { NudgeSetting } from '../components/NudgeSetting';
import { useCompletedHabits } from '../hooks/useCompletedHabits';
import {
  openPhoneSettings,
  reminderMessage,
  ReminderResult,
  sendTestReminder,
  syncHabitReminders,
} from '../services/reminders';
import { supabase } from '../services/supabase';
import { tracker } from '../services/tracker';
import { VoiceTest, voiceTestEnabled } from '../voice/VoiceTest';

const COMING_SOON = ['Coach tone'];

interface YouScreenProps {
  userId: string;
  email: string;
  onSignedOut: () => void;
}

export function YouScreen({ userId, email, onSignedOut }: YouScreenProps) {
  const { colors, preference, setPreference } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const completed = useCompletedHabits();
  const [restarted, setRestarted] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const show = (result: ReminderResult, success: string | null) => {
    setProblem(reminderMessage(result));
    setNote(result.status === 'set' ? success : null);
    setBlocked(result.status === 'blocked' || result.status === 'denied');
  };

  // Each habit has its own reminder time, set in the habit. This only lets them through.
  const turnOn = async () => {
    setProblem(null);
    show(await syncHabitReminders({ ask: true }), 'Reminders are on. Each habit reminds you at its own time.');
  };

  const test = async () => {
    setNote(null);
    const rows = await tracker.getToday().catch(() => []);
    const open = rows.find((row) => row.is_today && !isLogged(row));
    show(
      await sendTestReminder(open && { id: open.habit_id, title: open.title }),
      'A test reminder is on its way. It takes about 5 seconds.'
    );
  };

  const signOut = async () => {
    setConfirming(false);
    setProblem(null);
    // Offline, the server can't be told, but this phone must still forget the session.
    const { error } = await supabase.auth.signOut();
    if (error) {
      const local = await supabase.auth.signOut({ scope: 'local' });
      if (local.error) {
        setProblem("You couldn't be signed out. Try again.");
        return;
      }
    }
    onSignedOut();
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">
          You
        </Text>
        <View style={styles.group}>
          <Text variant="small" muted>
            Signed in as
          </Text>
          <Text>{email}</Text>
        </View>
        <View style={styles.group}>
          <Text variant="small" muted>
            Theme
          </Text>
          <SegmentedControl
            options={THEME_PREFERENCES}
            value={preference}
            onChange={setPreference}
          />
          <ThemePicker />
        </View>
        <View style={styles.group}>
          <Text variant="small" muted>
            Reminders
          </Text>
          <Text variant="small">
            Each habit reminds you at its own time. Change it, or turn it off, when you edit the habit.
          </Text>
          <Button label="Turn on reminders" quiet onPress={() => void turnOn()} />
          <Button label="Send a test reminder" quiet onPress={() => void test()} />
          {note ? (
            <Text variant="small" muted accessibilityLiveRegion="polite">
              {note}
            </Text>
          ) : null}
          {blocked ? (
            <Button label="Open phone settings" quiet onPress={() => void openPhoneSettings()} />
          ) : null}
        </View>
        {completed.habits.length > 0 ? (
          <View style={styles.group}>
            <Text variant="small" muted accessibilityRole="header">
              Completed habits
            </Text>
            {completed.habits.map((habit) => (
              <View key={habit.habit_id} style={styles.completed}>
                <Text>{habit.title}</Text>
                <Text variant="small" muted>
                  {completedSummary(habit)}
                </Text>
                {habit.restarted ? (
                  <Text variant="small" muted>
                    Restarted
                  </Text>
                ) : (
                  <Button
                    label={`Restart ${habit.title}`}
                    quiet
                    onPress={() =>
                      void completed.restart(habit).then((ok) => ok && setRestarted(habit.title))
                    }
                  />
                )}
              </View>
            ))}
            {restarted ? (
              <Text variant="small" muted accessibilityLiveRegion="polite">
                {`${restarted} starts again today. Its earlier run is kept.`}
              </Text>
            ) : null}
            <FormMessage message={completed.problem ?? undefined} />
          </View>
        ) : null}
        <NudgeSetting />
        <WhySection />
        {COMING_SOON.map((label) => (
          <View key={label} style={styles.group}>
            <Text>{label}</Text>
            <Text variant="small" muted>
              Coming soon
            </Text>
          </View>
        ))}
        {voiceTestEnabled ? (
          <Button label="Voice test (test builds only)" quiet onPress={() => setTestingVoice(true)} />
        ) : null}
        {voiceTestEnabled ? (
          <Button label="Voice test (test builds only)" quiet onPress={() => setTestingVoice(true)} />
        ) : null}
        <FormMessage message={problem ?? undefined} />
        <Button label="Sign out" quiet onPress={() => setConfirming(true)} />
      </ScrollView>
      {voiceTestEnabled ? <VoiceTest visible={testingVoice} onClose={() => setTestingVoice(false)} /> : null}
      <BottomSheet visible={confirming} title="Sign out?" onClose={() => setConfirming(false)}>
        <SheetOption label="Sign out" onPress={() => void signOut()} />
        <SheetOption label="Stay signed in" onPress={() => setConfirming(false)} />
      </BottomSheet>
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
    paddingTop: space.xxl,
  },
  completed: { gap: space.xs },
  group: { gap: space.xs },
});
