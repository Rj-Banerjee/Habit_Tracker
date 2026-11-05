import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  describeIntents,
  layout,
  noHabitMessage,
  OFF_TOPIC_MESSAGE,
  radius,
  space,
  VOICE_COMMAND_WORDS,
  VOICE_LANGUAGES,
  VoiceLanguage,
  whichQuestion,
} from '@habit-tracker/core';
import {
  BottomSheet,
  Button,
  Chip,
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
  onAddHabit: (title: string) => void;
  onClose: () => void;
}

export function VoiceSheet({ visible, voice, onAddHabit, onClose }: VoiceSheetProps) {
  const { colors } = useTheme();
  const [speech] = useState(speechInput);
  const [listening, setListening] = useState(false);
  const [micRefused, setMicRefused] = useState(false);
  const [heardNothing, setHeardNothing] = useState(false);
  const [language, setLanguage] = useState<VoiceLanguage>('en-IN');

  const close = () => {
    voice.reset();
    onClose();
  };

  const send = (said: string) => {
    voice.setDraft('');
    void voice.submit(said);
  };

  const startTalking = async () => {
    if (!speech) return;
    setMicRefused(false);
    setHeardNothing(false);
    let heard = '';
    const hints = [...VOICE_COMMAND_WORDS, ...voice.names];
    const started = await speech.start(
      { language, hints },
      (words) => {
        heard = words;
        voice.setDraft(words);
      },
      () => {
        setListening(false);
        if (heard.trim()) send(heard);
        else setHeardNothing(true);
      }
    );
    if (started) setListening(true);
    else setMicRefused(true);
  };

  const heardLine = voice.heard ? (
    <Text variant="small" muted>
      Heard: {voice.heard}
    </Text>
  ) : null;

  const talkHint = speech
    ? 'Or type it here.'
    : "Type it, or tap the mic on your phone's keyboard.";

  return (
    <BottomSheet visible={visible} title="Log by voice" onClose={close}>
      {voice.phase === 'working' ? (
        <ActivityIndicator color={colors.textMuted} accessibilityLabel="Working it out" />
      ) : voice.phase === 'asking' && voice.question ? (
        <>
          {heardLine}
          <Text accessibilityLiveRegion="polite">{whichQuestion(voice.question)}</Text>
          {voice.question.options.map((option) => (
            <SheetOption
              key={option.habit_id}
              label={option.habit_title}
              onPress={() => void voice.answer(option)}
            />
          ))}
        </>
      ) : voice.phase === 'confirming' ? (
        <>
          {heardLine}
          <Text accessibilityLiveRegion="polite">
            Did you mean: {describeIntents(voice.pending)}?
          </Text>
          <Button label="Yes" onPress={() => void voice.confirm()} />
          <Button label="No" quiet onPress={voice.reject} />
        </>
      ) : voice.phase === 'noHabit' ? (
        <>
          {heardLine}
          <Text accessibilityLiveRegion="polite">
            {noHabitMessage(voice.missingHabit ?? '')}
          </Text>
          <Button label="Create it" onPress={() => onAddHabit(voice.missingHabit ?? '')} />
          <Button label="Cancel" quiet onPress={close} />
        </>
      ) : voice.phase === 'offTopic' ? (
        <>
          {heardLine}
          <Text accessibilityLiveRegion="polite">{OFF_TOPIC_MESSAGE}</Text>
          <Button label="Try again" quiet onPress={voice.reset} />
        </>
      ) : (
        <>
          {voice.phase === 'unclear' ? (
            <Text accessibilityLiveRegion="polite">
              I didn&apos;t catch that. Fix what I heard, or try again.
            </Text>
          ) : null}
          {speech ? (
            <View style={styles.languages}>
              {VOICE_LANGUAGES.map(({ code, label }) => (
                <Chip
                  key={code}
                  label={label}
                  selected={language === code}
                  onPress={() => setLanguage(code)}
                />
              ))}
            </View>
          ) : null}
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
            label={voice.phase === 'unclear' ? 'What I heard' : 'What did you do?'}
            hint={talkHint}
            value={voice.draft}
            maxLength={500}
            onChangeText={voice.setDraft}
            onSubmitEditing={() => send(voice.draft)}
          />
          <Button
            label="Log it"
            disabled={!voice.draft.trim()}
            onPress={() => send(voice.draft)}
          />
          <FormMessage
            message={
              micRefused
                ? 'Microphone access is off. You can still type it.'
                : heardNothing
                  ? "I didn't hear anything. Keep holding while you talk."
                  : (voice.problem ?? undefined)
            }
          />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  languages: { flexDirection: 'row', gap: space.sm },
  mic: {
    minHeight: layout.minTouchTarget * 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
