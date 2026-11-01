import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, radius, space } from '@habit-tracker/core';
import { Button, Chip, FormMessage, Text, TextField, useTheme } from '@habit-tracker/ui';
import { Coach } from '../hooks/useCoach';

interface CoachDrawerProps {
  visible: boolean;
  coach: Coach;
  onQuickLog: () => void;
  onClose: () => void;
}

export function CoachDrawer({ visible, coach, onQuickLog, onClose }: CoachDrawerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const send = () => {
    const text = draft.trim();
    if (!text || coach.replying) return;
    setDraft('');
    void coach.send(text);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            backgroundColor: colors.canvas,
          },
        ]}
      >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <View style={styles.header}>
          <Text variant="title" accessibilityRole="header">
            Coach
          </Text>
          <Button label="Close" quiet onPress={onClose} />
        </View>

        <ScrollView
          ref={scroller}
          testID="coach-messages"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        >
          {coach.turns.length === 0 && !coach.notice ? (
            <View style={styles.chips}>
              <Chip label="Quick log my day" selected={false} onPress={onQuickLog} />
              <Chip
                label="I feel burned out"
                selected={false}
                onPress={() => void coach.send('I feel burned out', 'burned_out')}
              />
            </View>
          ) : null}

          {coach.turns.map((turn, index) => (
            <View
              key={index}
              style={[
                styles.turn,
                turn.role === 'user'
                  ? [styles.mine, { backgroundColor: colors.surfaceSunken }]
                  : styles.theirs,
              ]}
            >
              <Text>{turn.text}</Text>
            </View>
          ))}

          {coach.replying && coach.turns[coach.turns.length - 1]?.role === 'user' ? (
            <Text variant="small" muted accessibilityLiveRegion="polite">
              Thinking…
            </Text>
          ) : null}

          {coach.notice ? (
            <View style={styles.notice}>
              <FormMessage message={coach.notice} />
              {coach.turns.length > 0 && coach.canRetry ? (
                <Button label="Try again" quiet onPress={coach.retry} />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { borderTopColor: colors.border }]}>
          <View style={styles.field}>
            <TextField
              label="Message"
              value={draft}
              maxLength={4000}
              onChangeText={setDraft}
              onSubmitEditing={send}
            />
          </View>
          <Button label="Send" disabled={coach.replying || !draft.trim()} onPress={send} />
        </View>
      </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    padding: space.lg,
  },
  messages: {
    gap: space.md,
    width: '100%',
    maxWidth: layout.readingWidth,
    alignSelf: 'center',
    padding: space.lg,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  turn: { padding: space.md, borderRadius: radius.md },
  mine: { alignSelf: 'flex-end', maxWidth: '85%' },
  theirs: { alignSelf: 'flex-start' },
  notice: { gap: space.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  field: { flex: 1 },
});
