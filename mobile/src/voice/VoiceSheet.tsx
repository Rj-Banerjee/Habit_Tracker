import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { layout, radius, whichQuestion } from '@habit-tracker/core';
import {
  BottomSheet,
  Button,
  FormMessage,
  PressableState,
  SheetOption,
  Text,
  TextField,
  useTheme,
} from '@habit-tracker/ui';
import { Voice } from '../hooks/useVoice';
import { speechInput } from './speech';

interface VoiceSheetProps {
  visible: boolean;
  voice: Voice;
  onAddHabit: () => void;
  onClose: () => void;
}

export function VoiceSheet({ visible, voice, onAddHabit, onClose }: VoiceSheetProps) {
  const { colors } = useTheme();
  const [speech] = useState(speechInput);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [micRefused, setMicRefused] = useState(false);

  const close = () => {
    setText('');
    onClose();
  };

  const send = (said: string) => {
    setText('');
    void voice.submit(said);
  };

  const startTalking = async () => {
    if (!speech) return;
    setMicRefused(false);
    let heard = '';
    const started = await speech.start(
      (words) => {
        heard = words;
        setText(words);
      },
      () => {
        setListening(false);
        if (heard.trim()) send(heard);
      }
    );
    if (started) setListening(true);
    else setMicRefused(true);
  };

  const talkHint = speech
    ? 'Or type it here.'
    : "Type it, or tap the mic on your phone's keyboard.";

  return (
    <BottomSheet visible={visible} title="Log by voice" onClose={close}>
      {voice.phase === 'working' ? (
        <ActivityIndicator color={colors.textMuted} accessibilityLabel="Working it out" />
      ) : voice.phase === 'asking' && voice.question ? (
        <>
          <Text accessibilityLiveRegion="polite">{whichQuestion(voice.question)}</Text>
          {voice.question.options.map((option) => (
            <SheetOption
              key={option.habit_id}
              label={option.habit_title}
              onPress={() => void voice.answer(option)}
            />
          ))}
        </>
      ) : voice.phase === 'noMatch' ? (
        <>
          <Text accessibilityLiveRegion="polite">That didn&apos;t match one of your habits.</Text>
          <Button label="Add habit" onPress={onAddHabit} />
          <Button label="Try again" quiet onPress={voice.reset} />
        </>
      ) : (
        <>
          {speech ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hold to talk"
              onPressIn={() => void startTalking()}
              onPressOut={() => speech.stop()}
              style={({ focused }: PressableState) => [
                styles.mic,
                {
                  backgroundColor: listening ? colors.text : colors.surfaceSunken,
                  borderColor: focused ? colors.textMuted : colors.border,
                },
              ]}
            >
              <Text style={listening ? { color: colors.surface } : undefined}>
                {listening ? 'Listening…' : 'Hold to talk'}
              </Text>
            </Pressable>
          ) : null}
          <TextField
            label="What did you do?"
            hint={talkHint}
            value={text}
            maxLength={500}
            onChangeText={setText}
            onSubmitEditing={() => send(text)}
          />
          <Button label="Log it" disabled={!text.trim()} onPress={() => send(text)} />
          <FormMessage
            message={
              micRefused
                ? 'Microphone access is off. You can still type it.'
                : (voice.problem ?? undefined)
            }
          />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  mic: {
    minHeight: layout.minTouchTarget * 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
