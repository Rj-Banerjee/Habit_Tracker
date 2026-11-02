import React from 'react';
import { ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout, space } from '@habit-tracker/core';
import { Button, FormMessage, Text, TextField, useLayoutSize, useTheme } from '@habit-tracker/ui';
import { useSundayReview } from '../hooks/useSundayReview';

const WIN_LIMIT = 200;
const MOOD_LIMIT = 200;

interface SundayReviewScreenProps {
  userId: string;
  onClose: () => void;
}

export function SundayReviewScreen({ userId, onClose }: SundayReviewScreenProps) {
  const { colors } = useTheme();
  const size = useLayoutSize();
  const review = useSundayReview(userId);

  const body = () => {
    if (review.status === 'loading') {
      return <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading your week" />;
    }
    if (review.status === 'failed') {
      return (
        <View style={styles.group}>
          <Text>Your week couldn&apos;t load.</Text>
          <Button label="Try again" onPress={review.retry} />
        </View>
      );
    }
    return (
      <>
        <View style={styles.group}>
          <Text variant="small" muted accessibilityRole="header">
            {review.label}
          </Text>
          {review.week.length === 0 ? (
            <Text muted>Nothing was due that week.</Text>
          ) : (
            review.week.map((habit) => (
              <View key={habit.habitId} style={styles.row}>
                <Text style={styles.name}>{habit.title}</Text>
                <Text numeric>{habit.label}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.group}>
          <Text variant="small" muted accessibilityRole="header">
            Three wins, however small
          </Text>
          {review.wins.map((win, index) => (
            <TextField
              key={index}
              label={`Win ${index + 1}`}
              value={win}
              maxLength={WIN_LIMIT}
              onChangeText={(text) => review.setWin(index, text)}
            />
          ))}
          <TextField
            label="How did the week feel?"
            value={review.mood}
            maxLength={MOOD_LIMIT}
            onChangeText={review.editMood}
          />
          <FormMessage message={review.problem ?? undefined} />
          <Button
            label={review.saved ? 'Saved' : 'Save'}
            disabled={review.saving}
            onPress={() => void review.save()}
          />
        </View>

        <View style={styles.group}>
          <Text variant="display" accessibilityRole="header">
            A year from now
          </Text>
          {review.letter ? (
            <Text accessibilityLiveRegion="polite">{review.letter}</Text>
          ) : (
            <Button
              label={review.writing ? 'Writing…' : 'Write my letter'}
              quiet
              disabled={review.writing}
              onPress={() => void review.writeLetter()}
            />
          )}
          <FormMessage message={review.letterProblem ?? undefined} />
        </View>
      </>
    );
  };

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
          <View style={styles.header}>
            <Button label="Back" quiet onPress={onClose} />
            <Text variant="title" accessibilityRole="header">
              Sunday Review
            </Text>
          </View>
          {body()}
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
  },
  contentWide: { paddingTop: space.xxl },
  header: { gap: space.sm, alignItems: 'flex-start' },
  group: { gap: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  name: { flex: 1 },
});
