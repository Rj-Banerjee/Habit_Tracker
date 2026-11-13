import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  EXAMPLE_HABITS,
  FIELD_LIMITS,
  layout,
  onboardingHabitErrors,
  radius,
  space,
  STREAK_RULES,
  suggestedMinimum,
} from '@habit-tracker/core';
import {
  Button,
  FormMessage,
  Text,
  TextField,
  useLayoutSize,
  useTheme,
} from '@habit-tracker/ui';
import { useHardwareBack } from '../hooks/useHardwareBack';
import { STEPS, useOnboarding } from '../hooks/useOnboarding';

interface OnboardingScreenProps {
  userId: string;
  onDone: () => void;
}

export function OnboardingScreen({ userId, onDone }: OnboardingScreenProps) {
  const { colors, radii } = useTheme();
  const size = useLayoutSize();
  const flow = useOnboarding(userId, onDone);

  useHardwareBack(flow.back);

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

          {flow.step === 'habits' ? (
            <>
              <View style={styles.heading}>
                <Text variant="title" accessibilityRole="header">
                  Your first habits
                </Text>
                <Text muted>
                  Add as many as you like. Each gets a minimum version, the smallest thing that
                  still counts on a hard day. We suggest one, and you can write your own.
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
                      { borderRadius: radii.md },
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <TextField
                      label={`Habit ${index + 1}`}
                      placeholder={index === 0 ? EXAMPLE_HABITS[0] : undefined}
                      value={habit.title}
                      maxLength={FIELD_LIMITS.title}
                      error={index === 0 || !blank ? errors.title : undefined}
                      onChangeText={(title) => flow.setHabit(index, { title })}
                    />
                    <TextField
                      label={`Minimum version of habit ${index + 1}`}
                      placeholder={suggestedMinimum(habit.title) || undefined}
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
              <Button label="Add another habit" quiet onPress={flow.addHabit} />
              <FormMessage message={flow.problem ?? undefined} />
              <Button label="Next" disabled={flow.saving} onPress={() => void flow.saveHabits()} />
            </>
          ) : null}

          {flow.step === 'reminder' ? (
            <>
              <View style={styles.heading}>
                <Text variant="title" accessibilityRole="header">
                  Reminders
                </Text>
                <Text muted>
                  {Platform.OS === 'web'
                    ? 'Each habit reminds you on your phone, at its own time. You can change it in the habit.'
                    : 'Each habit reminds you at its own time. You can change it, or turn it off, in the habit.'}
                </Text>
              </View>
              <FormMessage message={flow.problem ?? undefined} />
              <Button
                label="Turn on reminders"
                disabled={flow.saving}
                onPress={() => void flow.saveReminder(true)}
              />
              <Button
                label="Not now"
                quiet
                disabled={flow.saving}
                onPress={() => void flow.saveReminder(false)}
              />
              <Button label="Back" quiet disabled={flow.saving} onPress={flow.back} />
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
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rule: { gap: space.xs },
});
