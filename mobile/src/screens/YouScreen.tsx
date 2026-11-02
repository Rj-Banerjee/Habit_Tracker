import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout, space } from '@habit-tracker/core';
import {
  BottomSheet,
  Button,
  FormMessage,
  SegmentedControl,
  SheetOption,
  Text,
  THEME_PREFERENCES,
  useTheme,
} from '@habit-tracker/ui';
import { WhySection } from '../coach/WhySection';
import { ReminderPicker } from '../components/ReminderPicker';
import {
  openPhoneSettings,
  reminderMessage,
  ReminderResult,
  sendTestReminder,
  setDailyReminder,
} from '../services/reminders';
import { supabase } from '../services/supabase';
import { tracker } from '../services/tracker';

const COMING_SOON = ['Coach tone'];

interface YouScreenProps {
  userId: string;
  email: string;
  onSignedOut: () => void;
}

export function YouScreen({ userId, email, onSignedOut }: YouScreenProps) {
  const { colors, preference, setPreference } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Undefined until loaded, so the picker doesn't flash a choice they didn't make.
  const [reminder, setReminder] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    tracker
      .getProfile()
      .then((profile) => setReminder(profile.reminder_time?.slice(0, 5) ?? null))
      .catch(() => setReminder(null));
  }, []);

  const show = (result: ReminderResult, success: string | null) => {
    setProblem(reminderMessage(result));
    setNote(result.status === 'set' ? success : null);
    setBlocked(result.status === 'blocked' || result.status === 'denied');
  };

  const changeReminder = async (time: string | null) => {
    setReminder(time);
    setProblem(null);
    try {
      await tracker.setReminderTime(userId, time);
      show(await setDailyReminder(time), time ? `Reminder set for ${time}.` : null);
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  const test = async () => {
    setNote(null);
    show(await sendTestReminder(), 'A test reminder is on its way. It takes about 5 seconds.');
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
        </View>
        {reminder !== undefined ? (
          <View style={styles.group}>
            <Text variant="small" muted>
              Daily reminder
            </Text>
            <ReminderPicker value={reminder} onChange={(time) => void changeReminder(time)} />
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
        ) : null}
        <WhySection />
        {COMING_SOON.map((label) => (
          <View key={label} style={styles.group}>
            <Text>{label}</Text>
            <Text variant="small" muted>
              Coming soon
            </Text>
          </View>
        ))}
        <FormMessage message={problem ?? undefined} />
        <Button label="Sign out" quiet onPress={() => setConfirming(true)} />
      </ScrollView>
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
  group: { gap: space.xs },
});
