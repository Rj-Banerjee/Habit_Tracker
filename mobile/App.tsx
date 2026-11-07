import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { Lora_400Regular, Lora_500Medium, Lora_600SemiBold } from '@expo-google-fonts/lora';
import { Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import type { Session } from '@supabase/supabase-js';
import { Tab, TabBar } from './src/components/TabBar';
import { EntitlementsProvider } from './src/hooks/useEntitlements';
import { useNeedsOnboarding } from './src/hooks/useNeedsOnboarding';
import { DesignReviewScreen } from './src/screens/DesignReviewScreen';
import { HabitFormScreen } from './src/screens/HabitFormScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { SundayReviewScreen } from './src/screens/SundayReviewScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { YouScreen } from './src/screens/YouScreen';
import { trackAppOpened } from './src/services/analytics';
import { supabase } from './src/services/supabase';
import { AuthForm, SheetInsetContext, ThemeProvider, useTheme } from '@habit-tracker/ui';

const THEME_KEY = 'theme-preference';
const THEME_CHOICE_KEY = 'theme-choice';
const themeStorage = {
  load: () => AsyncStorage.getItem(THEME_KEY),
  save: (value: string) => AsyncStorage.setItem(THEME_KEY, value),
  loadChoice: () => AsyncStorage.getItem(THEME_CHOICE_KEY),
  saveChoice: (value: string) => AsyncStorage.setItem(THEME_CHOICE_KEY, value),
};

function ThemedStatusBar() {
  const { name } = useTheme();
  return <StatusBar style={name === 'dark' ? 'light' : 'dark'} />;
}

function Root() {
  const { colors } = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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
      <View style={[styles.center, { backgroundColor: colors.canvas }]}>
        <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading" />
      </View>
    );
  }

  if (!session) return <AuthForm auth={supabase.auth} />;

  // The key starts everything afresh for the next person to sign in.
  return <SignedIn key={session.user.id} session={session} />;
}

function SheetInset({ children }: { children: React.ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  return <SheetInsetContext.Provider value={bottom}>{children}</SheetInsetContext.Provider>;
}

function SignedIn({ session }: { session: Session }) {
  // For retention: counted on open and on each return to the app, if analytics is on.
  useEffect(() => {
    void trackAppOpened();
    const sub = AppState.addEventListener('change', (next) => next === 'active' && void trackAppOpened());
    return () => sub.remove();
  }, []);
  const onboarding = useNeedsOnboarding();

  return (
    <EntitlementsProvider>
      <SignedInScreens session={session} onboarding={onboarding} />
    </EntitlementsProvider>
  );
}

function SignedInScreens({
  session,
  onboarding,
}: {
  session: Session;
  onboarding: ReturnType<typeof useNeedsOnboarding>;
}) {
  const { colors } = useTheme();
  // No router yet. Null shows the tabs; otherwise the form, for a new habit or habitId.
  const [habitForm, setHabitForm] = useState<{ habitId?: string; title?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [reviewing, setReviewing] = useState(false);

  if (onboarding.needed === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.canvas }]}>
        <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading" />
      </View>
    );
  }

  if (onboarding.needed) {
    return <OnboardingScreen userId={session.user.id} onDone={onboarding.finished} />;
  }

  if (reviewing) {
    return <SundayReviewScreen userId={session.user.id} onClose={() => setReviewing(false)} />;
  }

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
          onOpenReview={() => setReviewing(true)}
        />
      </View>
      <View style={[styles.root, tab !== 'progress' && styles.hidden]}>
        <ProgressScreen
          active={tab === 'progress'}
          onOpenReview={() => setReviewing(true)}
          onEditHabit={(habitId) => setHabitForm({ habitId })}
        />
      </View>
      <View style={[styles.root, tab !== 'you' && styles.hidden]}>
        <YouScreen
          userId={session.user.id}
          email={session.user.email ?? ''}
          onSignedOut={() => setTab('today')}
        />
      </View>
      <TabBar active={tab} onChange={setTab} />
    </View>
  );
}

export default function App() {
  // Every bundled typeface, so a theme or typeface switch shows at once.
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Lora_400Regular,
    Lora_500Medium,
    Lora_600SemiBold,
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });

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
        <SheetInset>
          <Root />
        </SheetInset>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  hidden: { display: 'none' },
});
