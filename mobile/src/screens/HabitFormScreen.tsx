import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ALL_DAYS,
  DEFAULT_REMINDERS,
  FIELD_LIMITS,
  HabitFormField,
  layout,
  space,
  suggestNames,
  usesTarget,
} from '@habit-tracker/core';
import {
  BottomSheet,
  Button,
  Chip,
  FormMessage,
  SheetOption,
  Text,
  TextField,
  useLayoutSize,
  useTheme,
} from '@habit-tracker/ui';
import { DaysField, EndField, MinimumField, ReminderField, TimeOfDayField } from '../habits/HabitFields';
import { IdentitySection } from '../habits/IdentitySection';
import { ReviewCard } from '../habits/ReviewCard';
import { useHabitForm } from '../hooks/useHabitForm';

interface FieldAnchorProps {
  field: HabitFormField;
  onMeasure: (field: HabitFormField, y: number) => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

const MORE_FIELDS: HabitFormField[] = ['identityId', 'minimumTarget', 'milestoneAmount', 'milestoneLabel'];

// Remembers where a field sits, so a save with problems can scroll to it.
function FieldAnchor({ field, onMeasure, style, children }: FieldAnchorProps) {
  return (
    <View
      testID={`field-${field}`}
      style={style}
      onLayout={(event) => onMeasure(field, event.nativeEvent.layout.y)}
    >
      {children}
    </View>
  );
}

interface HabitFormScreenProps {
  habitId?: string;
  initialTitle?: string;
  onClose: () => void;
}

export function HabitFormScreen({ habitId, initialTitle, onClose }: HabitFormScreenProps) {
  const { colors } = useTheme();
  const size = useLayoutSize();
  const form = useHabitForm({ habitId, initialTitle, onDone: onClose });
  const [showMore, setShowMore] = useState(false);
  const [sheet, setSheet] = useState<'discard' | 'archive' | null>(null);

  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Partial<Record<HabitFormField, number>>>({});
  const scrollPending = useRef<HabitFormField | null>(null);

  const scrollTo = (field: HabitFormField) => {
    const y = positions.current[field];
    if (y === undefined) {
      // Under "More", which is only now opening.
      scrollPending.current = field;
      return;
    }
    scrollPending.current = null;
    scroller.current?.scrollTo({ y: Math.max(0, y - space.lg) });
  };

  const measured = (field: HabitFormField, y: number) => {
    positions.current[field] = y;
    if (scrollPending.current === field) scrollTo(field);
  };

  const submit = async () => {
    const problem = await form.save();
    if (!problem) return;
    if (form.isEditing && MORE_FIELDS.includes(problem)) setShowMore(true);
    scrollTo(problem);
  };

  const back = () => {
    if (form.saving || sheet) return;
    if (form.dirty) setSheet('discard');
    else onClose();
  };

  // There's no router yet, so Android's back button and Escape come here. Escape
  // uses keyup because the sheet's Modal closes on keyup: a keydown would open the
  // sheet and the same key press would then close it. This also covers Escape
  // while typing, which useShortcut leaves alone.
  useEffect(() => {
    if (Platform.OS !== 'web') {
      const hardwareBack = BackHandler.addEventListener('hardwareBackPress', () => {
        back();
        return true;
      });
      return () => hardwareBack.remove();
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back();
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  });

  if (form.status !== 'ready') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.canvas }]}>
        <View style={[styles.content, styles.notice]}>
          {form.status === 'loading' ? (
            <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading" />
          ) : (
            <>
              <Text>This couldn&apos;t load.</Text>
              <Button label="Try again" onPress={form.retry} />
              <Button label="Back" quiet onPress={onClose} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { values, errors, suggestion } = form;
  const hasTarget = usesTarget(values.type);
  const creating = !form.isEditing;
  // On a phone, Done should only close the keyboard.
  const enterSaves = size === 'compact' ? {} : { onSubmitEditing: () => void submit() };
  const names = creating ? suggestNames(values.title).filter((habit) => habit.name !== values.title) : [];
  const parsed = form.parsedName;
  // Enter saves from whichever text field is last on screen.
  const endsAfter = values.endMode === 'after';
  const lastIsMinimum = !endsAfter && (creating || !showMore);
  const save = enterSaves.onSubmitEditing;

  const shared = (
    <>
      {hasTarget ? (
        <FieldAnchor field="target" onMeasure={measured} style={styles.row}>
          <View style={styles.rowField}>
            <TextField
              label="Target"
              value={values.target}
              keyboardType="decimal-pad"
              error={errors.target}
              onChangeText={(target) => form.set('target', target)}
            />
          </View>
          <View style={styles.rowField}>
            <TextField
              label="Unit"
              value={values.unit}
              maxLength={FIELD_LIMITS.unit}
              onChangeText={(unit) => form.set('unit', unit)}
            />
          </View>
        </FieldAnchor>
      ) : null}
      {creating && suggestion.setup.note ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          {suggestion.setup.note}
        </Text>
      ) : null}

      <FieldAnchor field="scheduleDays" onMeasure={measured}>
        <DaysField
          frequency={values.frequency}
          days={values.scheduleDays}
          perWeek={values.perWeek}
          reason={creating ? suggestion.setup.reason : null}
          error={errors.scheduleDays}
          onFrequency={(frequency) => form.set('frequency', frequency)}
          onDays={(days) => form.set('scheduleDays', days)}
          onPerWeek={(perWeek) => form.set('perWeek', perWeek)}
          onEveryDay={() => {
            form.set('frequency', 'days');
            form.set('scheduleDays', ALL_DAYS);
          }}
        />
      </FieldAnchor>

      <TimeOfDayField value={values.timeOfDay} onChange={(time) => form.set('timeOfDay', time)} />

      <FieldAnchor field="minimumDescription" onMeasure={measured}>
        <MinimumField
          value={values.minimumDescription}
          error={errors.minimumDescription}
          amount={creating && hasTarget ? form.minimum.target : null}
          unit={hasTarget ? values.unit.trim() || null : null}
          otherUnit={creating ? form.minimum.otherUnit : null}
          declined={form.minimum.declined}
          onChange={(text) => form.set('minimumDescription', text)}
          onDecline={form.setMinimumDeclined}
          onSubmitEditing={lastIsMinimum ? save : undefined}
        />
      </FieldAnchor>

      <FieldAnchor field="endsOn" onMeasure={measured}>
        <EndField
          mode={values.endMode}
          afterDays={values.endAfterDays}
          endsOn={values.endsOn}
          startsOn={form.startsOn}
          error={errors.endsOn}
          suggestedDays={creating ? suggestion.setup.suggestedEndDays : null}
          onMode={(mode) => form.set('endMode', mode)}
          onAfterDays={(days) => form.set('endAfterDays', days)}
          onEndsOn={(date) => form.set('endsOn', date)}
          onSubmitEditing={endsAfter && (creating || !showMore) ? save : undefined}
        />
      </FieldAnchor>
    </>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.canvas }]}>
      <KeyboardAvoidingView
        testID="habit-form-keyboard"
        style={styles.root}
        // Android is edge to edge, so the window no longer shrinks for the keyboard.
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <ScrollView
          ref={scroller}
          testID="habit-form"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={[styles.content, size !== 'compact' && styles.contentWide]}
        >
          <View style={styles.header}>
            <Button label="Back" quiet disabled={form.saving} onPress={back} />
            <Text variant="title" accessibilityRole="header">
              {form.isEditing ? 'Edit habit' : 'New habit'}
            </Text>
          </View>

          <FieldAnchor field="title" onMeasure={measured} style={styles.field}>
            <TextField
              label="Name"
              value={values.title}
              maxLength={FIELD_LIMITS.title}
              error={errors.title}
              onChangeText={(title) => form.set('title', title)}
            />
            {names.length > 0 ? (
              <View style={styles.chips} accessibilityLabel="Suggestions">
                {names.map((habit) => (
                  <Chip
                    key={habit.id}
                    label={habit.name}
                    accessibilityLabel={`Use ${habit.name}`}
                    selected={false}
                    onPress={() => form.set('title', habit.name)}
                  />
                ))}
              </View>
            ) : null}
            {creating && parsed.target !== null ? (
              <Text variant="small" muted>
                {`Saved as ${parsed.title}, with a target of ${parsed.target} ${parsed.unit}.`}
              </Text>
            ) : null}
          </FieldAnchor>

          {shared}

          {creating ? (
            <ReviewCard
              lines={form.review}
              accepted={form.accepted}
              pending={suggestion.pending}
              onAcceptAll={form.acceptAll}
              type={values.type}
              unit={values.unit}
              identities={form.identities}
              identityName={form.identityName}
              reminderTime={values.reminderTime}
              timeOfDay={values.timeOfDay}
              setup={values.setupDescription}
              voiceAliases={values.voiceAliases}
              onType={(type) => form.set('type', type)}
              onUnit={(unit) => form.set('unit', unit)}
              onChooseIdentity={form.chooseIdentity}
              onNameIdentity={form.nameNewIdentity}
              onReminder={(time) => form.set('reminderTime', time)}
              onSetup={(text) => form.set('setupDescription', text)}
              onVoiceAliases={(text) => form.set('voiceAliases', text)}
            />
          ) : (
            <>
              <Button label={showMore ? 'Less' : 'More'} quiet onPress={() => setShowMore(!showMore)} />
              {showMore ? (
                <>
                  <FieldAnchor field="identityId" onMeasure={measured}>
                    <IdentitySection
                      identities={form.identities}
                      selectedId={values.identityId}
                      draft={form.draft}
                      error={errors.identityId}
                      onChoose={form.chooseIdentity}
                      onToggleNew={form.toggleNewIdentity}
                      onDraftChange={form.setDraft}
                    />
                  </FieldAnchor>
                  <TextField
                    label="Full version"
                    value={values.fullDescription}
                    placeholder={values.title.trim() || undefined}
                    maxLength={FIELD_LIMITS.levelDescription}
                    onChangeText={(text) => form.set('fullDescription', text)}
                  />
                  {hasTarget ? (
                    <FieldAnchor field="minimumTarget" onMeasure={measured}>
                      <TextField
                        label="Minimum target"
                        value={values.minimumTarget}
                        keyboardType="decimal-pad"
                        error={errors.minimumTarget}
                        onChangeText={(target) => form.set('minimumTarget', target)}
                      />
                    </FieldAnchor>
                  ) : null}
                  <TextField
                    label="Just set up"
                    hint="The first step, like putting on your shoes."
                    value={values.setupDescription}
                    maxLength={FIELD_LIMITS.levelDescription}
                    onChangeText={(text) => form.set('setupDescription', text)}
                  />
                  <ReminderField
                    value={values.reminderTime}
                    fallback={DEFAULT_REMINDERS[values.timeOfDay] ?? '09:00'}
                    onChange={(time) => form.set('reminderTime', time)}
                  />
                  <TextField
                    label="Voice names"
                    hint="Other names you might say out loud."
                    value={values.voiceAliases}
                    onChangeText={(aliases) => form.set('voiceAliases', aliases)}
                  />
                  <FieldAnchor field="milestoneAmount" onMeasure={measured}>
                    <TextField
                      label="Milestone amount"
                      hint="For example, 300 pages = 1 book."
                      value={values.milestoneAmount}
                      keyboardType="decimal-pad"
                      error={errors.milestoneAmount}
                      onChangeText={(amount) => form.set('milestoneAmount', amount)}
                    />
                  </FieldAnchor>
                  <FieldAnchor field="milestoneLabel" onMeasure={measured}>
                    <TextField
                      label="Milestone label"
                      value={values.milestoneLabel}
                      maxLength={FIELD_LIMITS.milestoneLabel}
                      error={errors.milestoneLabel}
                      onChangeText={(label) => form.set('milestoneLabel', label)}
                      {...enterSaves}
                    />
                  </FieldAnchor>
                </>
              ) : null}
            </>
          )}

          <View style={styles.footer}>
            <FormMessage message={form.saveError} />
            {form.isEditing ? (
              <Text variant="small" muted>
                Changes apply from today. Past days stay as they were.
              </Text>
            ) : null}
            <Button label="Save" disabled={form.saving} onPress={() => void submit()} />
            {form.isEditing ? (
              <Button
                label="Archive habit"
                quiet
                disabled={form.saving}
                onPress={() => setSheet('archive')}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={sheet === 'discard'}
        title="Discard your changes?"
        onClose={() => setSheet(null)}
      >
        <SheetOption label="Keep editing" onPress={() => setSheet(null)} />
        <SheetOption label="Discard" onPress={onClose} />
      </BottomSheet>
      <BottomSheet
        visible={sheet === 'archive'}
        title={`Archive ${form.initial.title}? Its history is kept.`}
        onClose={() => setSheet(null)}
      >
        <SheetOption
          label="Archive"
          onPress={() => {
            setSheet(null);
            form.archive();
          }}
        />
        <SheetOption label="Keep" onPress={() => setSheet(null)} />
      </BottomSheet>
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
  notice: { gap: space.md },
  field: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  rowField: { flex: 1 },
  footer: { gap: space.md },
});
