import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  DEFAULT_REMINDERS,
  FIELD_LIMITS,
  HABIT_TYPE_LABELS,
  HabitType,
  Identity,
  layout,
  ReviewLine,
  space,
  TimeOfDay,
  usesTarget,
} from '@habit-tracker/core';
import {
  BottomSheet,
  Button,
  Chip,
  PressableState,
  SegmentedControl,
  Text,
  TextField,
  useTheme,
} from '@habit-tracker/ui';
import { ReminderField } from './HabitFields';

const TYPE_OPTIONS = (Object.keys(HABIT_TYPE_LABELS) as HabitType[]).map((value) => ({
  value,
  label: HABIT_TYPE_LABELS[value],
}));

interface ReviewCardProps {
  lines: { line: ReviewLine; label: string; value: string }[];
  accepted: boolean;
  pending: boolean;
  onAcceptAll: () => void;
  // The editors' current values.
  type: HabitType;
  unit: string;
  identities: Identity[];
  identityName: string;
  reminderTime: string | null;
  timeOfDay: TimeOfDay;
  setup: string;
  voiceAliases: string;
  onType: (type: HabitType) => void;
  onUnit: (unit: string) => void;
  onChooseIdentity: (id: string) => void;
  onNameIdentity: (name: string) => void;
  onReminder: (time: string | null) => void;
  onSetup: (text: string) => void;
  onVoiceAliases: (text: string) => void;
}

// "We set these up for you": everything inferred, one line each, to accept at once or
// tap and change. Nothing here is required, so saving never waits on it.
export function ReviewCard(props: ReviewCardProps) {
  const { colors, radii } = useTheme();
  const [editing, setEditing] = useState<ReviewLine | null>(null);
  const close = () => setEditing(null);
  const editingLabel = props.lines.find((line) => line.line === editing)?.label ?? '';

  return (
    <View
      style={[styles.card, { borderRadius: radii.md, backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text variant="small" accessibilityRole="header">
        We set these up for you
      </Text>
      {props.pending ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          Finding suggestions…
        </Text>
      ) : null}
      {props.lines.map(({ line, label, value }) => (
        <Pressable
          key={line}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value}. Change`}
          onPress={() => setEditing(line)}
          style={({ hovered, focused }: PressableState) => [
            styles.line,
            { borderRadius: radii.sm },
            hovered && { backgroundColor: colors.surfaceSunken },
            focused && { borderColor: colors.text },
          ]}
        >
          <Text variant="small" muted style={styles.label}>
            {label}
          </Text>
          <Text variant="small" style={styles.value}>
            {value}
          </Text>
        </Pressable>
      ))}
      {props.accepted ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          All set. You can change any of these later.
        </Text>
      ) : (
        <Button label="Accept all" quiet onPress={props.onAcceptAll} />
      )}

      <BottomSheet visible={editing !== null} title={editingLabel} onClose={close}>
        <View style={styles.editor}>
          {editing === 'type' ? (
            <>
              <SegmentedControl options={TYPE_OPTIONS} value={props.type} onChange={props.onType} />
              {usesTarget(props.type) ? (
                <TextField label="Unit" value={props.unit} maxLength={FIELD_LIMITS.unit} onChangeText={props.onUnit} />
              ) : null}
            </>
          ) : null}
          {editing === 'identity' ? (
            <>
              <View style={styles.chips}>
                {props.identities.map((identity) => (
                  <Chip
                    key={identity.id}
                    label={identity.name}
                    selected={identity.name === props.identityName}
                    onPress={() => props.onChooseIdentity(identity.id)}
                  />
                ))}
              </View>
              <TextField
                label="Or a new identity"
                hint='Who this habit makes you, such as "The Athlete".'
                value={props.identities.some((i) => i.name === props.identityName) ? '' : props.identityName}
                maxLength={FIELD_LIMITS.identityName}
                onChangeText={props.onNameIdentity}
              />
            </>
          ) : null}
          {editing === 'reminder' ? (
            <ReminderField
              value={props.reminderTime}
              fallback={DEFAULT_REMINDERS[props.timeOfDay] ?? '09:00'}
              onChange={props.onReminder}
            />
          ) : null}
          {editing === 'setup' ? (
            <TextField
              label="Just set up"
              hint="The first step, like putting on your shoes. It counts on the hardest days."
              value={props.setup}
              maxLength={FIELD_LIMITS.levelDescription}
              onChangeText={props.onSetup}
            />
          ) : null}
          {editing === 'voice' ? (
            <TextField
              label="Voice names"
              hint="Other names you might say out loud, separated by commas."
              value={props.voiceAliases}
              onChangeText={props.onVoiceAliases}
            />
          ) : null}
          <Button label="Done" onPress={close} />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderWidth: StyleSheet.hairlineWidth },
  line: {
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  label: { width: space.xxl * 3 },
  value: { flex: 1 },
  editor: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
