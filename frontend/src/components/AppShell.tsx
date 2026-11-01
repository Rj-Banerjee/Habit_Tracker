'use client';

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'next/navigation';
import { layout, space, StreakMode } from '@habit-tracker/core';
import {
  BottomSheet,
  Button,
  Chip,
  FormMessage,
  SegmentedControl,
  Text,
  useShortcut,
  useTheme,
} from '@habit-tracker/ui';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import { tracker } from '../services/tracker';

const LINKS = [
  { href: '/', label: 'Grid', shortcut: 'g' },
  { href: '/review/', label: 'Weekly review', shortcut: 'w' },
];

const MODE_HELP: Record<StreakMode, string> = {
  grace: 'Grace Days and Streak Repair are on.',
  strict: 'No Grace Days or Streak Repair. The 24-hour back-log is still allowed.',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<StreakMode>('grace');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/login/');
  }, [loading, session, router]);

  useShortcut('g', () => router.push('/'));
  useShortcut('w', () => router.push('/review/'));

  const openSettings = () => {
    setSettingsOpen(true);
    tracker.getProfile().then((profile) => setMode(profile.mode)).catch(() => {});
  };

  const changeMode = async (next: StreakMode) => {
    const previous = mode;
    setMode(next);
    setMessage(null);
    try {
      if (session) await tracker.setMode(session.user.id, next);
    } catch (err) {
      setMode(previous);
      setMessage((err as Error).message);
    }
  };

  if (loading || !session) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.canvas }]}>
        <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text variant="title" accessibilityRole="header">
          Habit tracker
        </Text>
        <View style={styles.nav} accessibilityRole="navigation">
          {LINKS.map((link) => (
            <Chip
              key={link.href}
              label={link.label}
              selected={pathname === link.href}
              onPress={() => router.push(link.href)}
            />
          ))}
          <Pressable
            onPress={openSettings}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={styles.settings}
          >
            <Text variant="small" muted>
              Settings
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>

      <BottomSheet visible={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <Text variant="small" muted numberOfLines={1}>
          {session.user.email}
        </Text>
        <Text>Streak mode</Text>
        <SegmentedControl
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'grace', label: 'Grace' },
            { value: 'strict', label: 'Strict' },
          ]}
        />
        <Text variant="small" muted>
          {MODE_HELP[mode]}
        </Text>
        <FormMessage message={message} />
        <Button quiet label="Sign out" onPress={() => supabase.auth.signOut()} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nav: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  settings: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  body: { gap: space.xl, padding: space.lg },
});
