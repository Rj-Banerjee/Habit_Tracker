import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import type { Session } from '@supabase/supabase-js';
import { DesignReviewScreen } from './src/screens/DesignReviewScreen';
import { HabitFormScreen } from './src/screens/HabitFormScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { supabase } from './src/services/supabase';
import { AuthForm, ThemeProvider, useTheme } from '@habit-tracker/ui';

function Root() {
  const { colors } = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // No router yet. Null shows Today; otherwise the form, for a new habit or habitId.
  const [habitForm, setHabitForm] = useState<{ habitId?: string } | null>(null);

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

  return habitForm ? (
    <HabitFormScreen
      userId={session.user.id}
      habitId={habitForm.habitId}
      onClose={() => setHabitForm(null)}
    />
  ) : (
    <TodayScreen
      onAddHabit={() => setHabitForm({})}
      onEditHabit={(habitId) => setHabitForm({ habitId })}
    />
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
      <ThemeProvider>
        <StatusBar style="auto" />
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
