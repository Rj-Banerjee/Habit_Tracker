import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import type { Session } from '@supabase/supabase-js';
import { Tab, TabBar } from './src/components/TabBar';
import { DesignReviewScreen } from './src/screens/DesignReviewScreen';
import { HabitFormScreen } from './src/screens/HabitFormScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { YouScreen } from './src/screens/YouScreen';
import { supabase } from './src/services/supabase';
import { AuthForm, ThemeProvider, useTheme } from '@habit-tracker/ui';

const THEME_KEY = 'theme-preference';
const themeStorage = {
  load: () => AsyncStorage.getItem(THEME_KEY),
  save: (value: string) => AsyncStorage.setItem(THEME_KEY, value),
};

function ThemedStatusBar() {
  const { name } = useTheme();
  return <StatusBar style={name === 'dark' ? 'light' : 'dark'} />;
}

function Root() {
  const { colors } = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // No router yet. Null shows Today; otherwise the form, for a new habit or habitId.
  const [habitForm, setHabitForm] = useState<{ habitId?: string; title?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading" />
      </View>
    );
  }

  if (!session) return <AuthForm auth={supabase.auth} />;

  if (habitForm) {
    return (
      <HabitFormScreen
        habitId={habitForm.habitId}
        initialTitle={habitForm.title}
        onClose={() => setHabitForm(null)}
      />
    );
  }

  // Both stay mounted, so a coach conversation survives a look at the You tab.
  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <View style={[styles.root, tab !== 'today' && styles.hidden]}>
        <TodayScreen
          onAddHabit={(title) => setHabitForm({ title })}
          onEditHabit={(habitId) => setHabitForm({ habitId })}
        />
      </View>
      <View style={[styles.root, tab !== 'progress' && styles.hidden]}>
        <ProgressScreen active={tab === 'progress'} />
      </View>
      <View style={[styles.root, tab !== 'you' && styles.hidden]}>
        <YouScreen email={session.user.email ?? ''} onSignedOut={() => setTab('today')} />
      </View>
      <TabBar active={tab} onChange={setTab} />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold });

  if (!fontsLoaded) {
    return null;
  }

  if (process.env.EXPO_PUBLIC_DESIGN_REVIEW === '1') {
    return <DesignReviewScreen />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider storage={themeStorage}>
        <ThemedStatusBar />
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hidden: { display: 'none' },
});
