import React, { useEffect } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FIELD_LIMITS,
  IDENTITY_SUGGESTIONS,
  layout,
  MAX_ONBOARDING_HABITS,
  onboardingHabitErrors,
  radius,
  space,
  STREAK_RULES,
} from '@habit-tracker/core';
import {
  Button,
  Chip,
  FormMessage,
  Text,
  TextField,
  useLayoutSize,
  useTheme,
} from '@habit-tracker/ui';
import { ReminderPicker } from '../components/ReminderPicker';
import { STEPS, useOnboarding } from '../hooks/useOnboarding';

interface OnboardingScreenProps {
  userId: string;
  onDone: () => void;
}

export function OnboardingScreen({ userId, onDone }: OnboardingScreenProps) {
  const { colors } = useTheme();
  const size = useLayoutSize();
  const flow = useOnboarding(userId, onDone);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const hardwareBack = BackHandler.addEventListener('hardwareBackPress', flow.back);
    return () => hardwareBack.remove();
  });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.canvas }]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, size !== 'compact' && styles.contentWide]}
        >
          <Text variant="small" muted numeric accessibilityLiveRegion="polite">
            Step {flow.stepNumber} of {STEPS.length}
          </Text>

          {flow.step === 'identity' ? (
            <>
              <View style={styles.heading}>
                <Text variant="title" accessibilityRole="header">
                  Who do you want to become?
                </Text>
                <Text muted>Habits stick when they say something about you.</Text>
              </View>
              <View style={styles.chips}>
                {IDENTITY_SUGGESTIONS.map(({ name }) => (
                  <Chip
                    key={name}
                    label={name}
                    selected={flow.identity === name}
                    onPress={() => flow.setIdentity(name)}
                  />
                ))}
              </View>
              <TextField
                label="Or write your own"
                value={flow.suggestion ? '' : flow.identity}
                maxLength={FIELD_LIMITS.identityName}
                error={flow.identityError}
                onChangeText={flow.setIdentity}
              />
              <TextField
                label="Why does this matter to you?"
                hint="Optional. The coach uses this to encourage you."
                value={flow.whyText}
                maxLength={FIELD_LIMITS.whyText}
                onChangeText={flow.setWhyText}
              />
              <Button label="Next" onPress={flow.nextFromIdentity} />
            </>
          ) : null}

          {flow.step === 'habits' ? (
            <>
              <View style={styles.heading}>
                <Text variant="title" accessibilityRole="header">
                  Start with up to {MAX_ONBOARDING_HABITS} habits
                </Text>
                <Text muted>
                  Give each one a minimum version: the smallest thing that still counts on a hard
                  day.
                </Text>
              </View>
              {flow.habits.map((habit, index) => {
                const errors = flow.attempted ? onboardingHabitErrors(habit) : {};
                const blank = !habit.title.trim() && !habit.minimum.trim();
                return (
                  <View
                    key={index}
                    style={[
                      styles.card,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <TextField
                      label={`Habit ${index + 1}`}
                      placeholder={index === 0 ? flow.suggestion?.example : undefined}
                      value={habit.title}
                      maxLength={FIELD_LIMITS.title}
                      error={index === 0 || !blank ? errors.title : undefined}
                      onChangeText={(title) => flow.setHabit(index, { title })}
                    />
                    <TextField
                      label={`Minimum version of habit ${index + 1}`}
                      placeholder={index === 0 ? flow.suggestion?.minimum : undefined}
                      value={habit.minimum}
                      maxLength={FIELD_LIMITS.levelDescription}
                      error={index === 0 || !blank ? errors.minimumDescription : undefined}
                      onChangeText={(minimum) => flow.setHabit(index, { minimum })}
                    />
                    {flow.habits.length > 1 ? (
                      <Button
                        label={`Remove habit ${index + 1}`}
                        quiet
                        onPress={() => flow.removeHabit(index)}
                      />
                    ) : null}
                  </View>
                );
              })}
              {flow.habits.length < MAX_ONBOARDING_HABITS ? (
                <Button label="Add another habit" quiet onPress={flow.addHabit} />
              ) : null}
              <FormMessage message={flow.problem ?? undefined} />
              <Button label="Next" disabled={flow.saving} onPress={() => void flow.saveHabits()} />
              <Button label="Back" quiet disabled={flow.saving} onPress={flow.back} />
            </>
          ) : null}

          {flow.step === 'reminder' ? (
            <>
              <View style={styles.heading}>
                <Text variant="title" accessibilityRole="header">
                  When should we remind you?
                </Text>
                <Text muted>
                  {Platform.OS === 'web'
                    ? 'One reminder a day, on your phone. You can change this any time in You.'
                    : 'One reminder a day. You can change this any time in You.'}
                </Text>
              </View>
              <ReminderPicker value={flow.reminder} onChange={flow.setReminder} />
              <FormMessage message={flow.problem ?? undefined} />
              <Button
                label="Next"
                disabled={flow.saving}
                onPress={() => void flow.saveReminder()}
              />
            </>
          ) : null}

          {flow.step === 'rules' ? (
            <>
              <View style={styles.heading}>
                <Text variant="title" accessibilityRole="header">
                  How streaks work here
                </Text>
                <Text muted>Life gets in the way, and that&apos;s planned for.</Text>
              </View>
              {flow.reminderNote ? <FormMessage message={flow.reminderNote} /> : null}
              {STREAK_RULES.map((rule) => (
                <View key={rule.title} style={styles.rule}>
                  <Text>{rule.title}</Text>
                  <Text variant="small" muted>
                    {rule.body}
                  </Text>
                </View>
              ))}
              <FormMessage message={flow.problem ?? undefined} />
              <Button label="Start" disabled={flow.saving} onPress={() => void flow.finish()} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingTop: space.xl,
  },
  contentWide: { paddingTop: space.xxl },
  heading: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rule: { gap: space.xs },
});
