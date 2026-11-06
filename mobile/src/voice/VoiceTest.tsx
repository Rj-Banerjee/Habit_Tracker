import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CoachError,
  layout,
  space,
  SPOKEN_HABIT_NAMES,
  SPOKEN_PHRASES,
  VOICE_COMMAND_WORDS,
} from '@habit-tracker/core';
import { Button, FormMessage, PressableState, Text, useTheme } from '@habit-tracker/ui';
import { ai } from '../services/ai';
import { speechInput } from './speech';

// The spoken voice test, for test builds only: each phrase is said aloud, and what the
// phone's recogniser heard is saved on the AI service, which scores it later with the real
// parser. Nothing is logged here. Progress is kept, so it can be done in several sittings.

const DONE_KEY = 'voice-test-done';

export const voiceTestEnabled = process.env.EXPO_PUBLIC_VOICE_TEST === '1';

export function VoiceTest({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, radii } = useTheme();
  const [speech] = useState(speechInput);
  const [done, setDone] = useState<Set<string> | null>(null);
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DONE_KEY)
      .then((raw) => {
        const ids = new Set<string>(raw ? JSON.parse(raw) : []);
        setDone(ids);
        const next = SPOKEN_PHRASES.findIndex((p) => !ids.has(p.id));
        setIndex(next === -1 ? SPOKEN_PHRASES.length : next);
      })
      .catch(() => setDone(new Set()));
  }, []);

  const phrase = SPOKEN_PHRASES[index];

  const next = () => {
    setHeard('');
    setSaved(false);
    setProblem(null);
    setIndex((i) => {
      const after = SPOKEN_PHRASES.findIndex((p, at) => at > i && !done?.has(p.id));
      return after === -1 ? SPOKEN_PHRASES.length : after;
    });
  };

  const save = async (words: string) => {
    if (!phrase || !done) return;
    try {
      await ai.voiceSample(phrase.id, words, phrase.language);
      const ids = new Set(done).add(phrase.id);
      setDone(ids);
      setSaved(true);
      await AsyncStorage.setItem(DONE_KEY, JSON.stringify([...ids])).catch(() => {});
    } catch (error) {
      setProblem(error instanceof CoachError ? error.message : "Couldn't save that one. Try again.");
    }
  };

  const startTalking = async () => {
    if (!speech || !phrase) return;
    setProblem(null);
    setSaved(false);
    let words = '';
    const started = await speech.start(
      { language: phrase.language, hints: [...VOICE_COMMAND_WORDS, ...SPOKEN_HABIT_NAMES] },
      (text) => {
        words = text;
        setHeard(text);
      },
      () => {
        setListening(false);
        if (words.trim()) void save(words.trim());
        else setProblem("I didn't hear anything. Keep holding while you talk.");
      }
    );
    if (started) setListening(true);
    else setProblem('Microphone access is off.');
  };

  const count = done?.size ?? 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.canvas }]}>
        <View style={styles.top}>
          <Text variant="title" accessibilityRole="header">
            Voice test
          </Text>
          <Text variant="small" muted numeric>
            {`${count} of ${SPOKEN_PHRASES.length} recorded`}
          </Text>
        </View>
        {!speech ? (
          <Text>Speech recognition isn&apos;t available on this phone.</Text>
        ) : !phrase ? (
          <Text accessibilityLiveRegion="polite">All phrases are recorded. Thank you.</Text>
        ) : (
          <View style={styles.body}>
            <Text variant="small" muted>
              {`Say this the way you naturally would${phrase.language === 'hi-IN' ? ', in Hindi' : ''}:`}
            </Text>
            <Text variant="display">{phrase.say}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hold to talk"
              onPressIn={() => void startTalking()}
              onPressOut={() => speech.stop()}
              style={({ focused }: PressableState) => [
                styles.mic,
                {
                  borderRadius: radii.md,
                  backgroundColor: listening ? colors.text : colors.surfaceSunken,
                  borderColor: focused ? colors.textMuted : colors.border,
                },
              ]}
            >
              <Text style={listening ? { color: colors.surface } : undefined}>
                {listening ? 'Listening…' : 'Hold to talk'}
              </Text>
            </Pressable>
            {heard ? (
              <Text muted accessibilityLiveRegion="polite">
                {`Heard: ${heard}${saved ? ' (saved)' : ''}`}
              </Text>
            ) : null}
            <FormMessage message={problem ?? undefined} />
            <Button label={saved ? 'Next phrase' : 'Skip this one'} quiet={!saved} onPress={next} />
          </View>
        )}
        <Button label="Close" quiet onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.lg, gap: space.lg },
  top: { gap: space.xs },
  body: { flex: 1, gap: space.md },
  mic: {
    minHeight: layout.minTouchTarget * 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
