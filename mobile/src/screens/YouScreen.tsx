import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout, space } from '@habit-tracker/core';
import { BottomSheet, Button, FormMessage, SheetOption, Text, useTheme } from '@habit-tracker/ui';
import { supabase } from '../services/supabase';

const COMING_SOON = ['Reminders', 'Coach tone'];

interface YouScreenProps {
  email: string;
  onSignedOut: () => void;
}

export function YouScreen({ email, onSignedOut }: YouScreenProps) {
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
