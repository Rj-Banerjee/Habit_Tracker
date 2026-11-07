import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  EndMode,
  FIELD_LIMITS,
  HabitFrequency,
  MAX_PER_WEEK,
  space,
  TimeOfDay,
  TIME_OF_DAY_LABELS,
  TIMES_OF_DAY,
} from '@habit-tracker/core';
import {
  Chip,
  FormMessage,
  SegmentedControl,
  Stepper,
  Text,
  TextField,
  ToggleRow,
  WeekdayPicker,
} from '@habit-tracker/ui';

// The pieces of the habit form, shared by creating and editing. Each only shows and
// reports: the form hook holds the values and the rules.

const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 'days', label: 'Specific days' },
  { value: 'per_week', label: 'Times per week' },
];

interface DaysFieldProps {
  frequency: HabitFrequency;
  days: number[];
  perWeek: number;
  reason?: string | null;
  error?: string;
  onFrequency: (frequency: HabitFrequency) => void;
  onDays: (days: number[]) => void;
  onPerWeek: (perWeek: number) => void;
  // 7 a week is every day, which is specific days with all seven ticked.
  onEveryDay: () => void;
}

export function DaysField(props: DaysFieldProps) {
  return (
    <View style={styles.field}>
      <Text variant="small">Days</Text>
      <SegmentedControl options={FREQUENCY_OPTIONS} value={props.frequency} onChange={props.onFrequency} />
      {props.frequency === 'days' ? (
        <WeekdayPicker days={props.days} onChange={props.onDays} />
      ) : (
        <Stepper
          label="Times per week"
          unit={props.perWeek === 1 ? 'time a week' : 'times a week'}
          value={props.perWeek}
          min={1}
          max={MAX_PER_WEEK}
          onChange={props.onPerWeek}
          onPastMax={props.onEveryDay}
        />
      )}
      {props.reason ? (
        <Text variant="small" muted>
          {props.reason}
        </Text>
      ) : null}
      <FormMessage message={props.error} />
    </View>
  );
}

export function TimeOfDayField({ value, onChange }: { value: TimeOfDay; onChange: (value: TimeOfDay) => void }) {
  return (
    <View style={styles.field}>
      <Text variant="small">Time of day</Text>
      <SegmentedControl
        options={TIMES_OF_DAY.map((time) => ({ value: time, label: TIME_OF_DAY_LABELS[time] }))}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

interface MinimumFieldProps {
  value: string;
  error?: string;
  // The amount read from the text, to confirm.
  amount: number | null;
  unit: string | null;
  otherUnit: string | null;
  declined: boolean;
  onChange: (text: string) => void;
  onDecline: (declined: boolean) => void;
  // Enter saves when this is the last text field, on wide screens.
  onSubmitEditing?: () => void;
}

export function MinimumField(props: MinimumFieldProps) {
  return (
    <View style={styles.field}>
      <TextField
        label="Minimum version"
        hint="The smallest version that still counts on a hard day."
        value={props.value}
        maxLength={FIELD_LIMITS.levelDescription}
        error={props.error}
        onChangeText={props.onChange}
        onSubmitEditing={props.onSubmitEditing}
      />
      {props.amount !== null && props.unit ? (
        <View style={styles.chips}>
          <Chip
            label={`Minimum: ${props.amount} ${props.unit}`}
            accessibilityLabel={`Count ${props.amount} ${props.unit} as the minimum`}
            selected={!props.declined}
            onPress={() => props.onDecline(!props.declined)}
          />
        </View>
      ) : props.otherUnit && props.unit ? (
        <Text variant="small" muted>
          {`${props.otherUnit} can't count toward ${props.unit}, so this stays a description.`}
        </Text>
      ) : null}
    </View>
  );
}

const END_OPTIONS: { value: Exclude<EndMode, 'never'>; label: string }[] = [
  { value: 'after', label: 'After a number of days' },
  { value: 'on', label: 'On a date' },
];

interface EndFieldProps {
  mode: EndMode;
  afterDays: string;
  endsOn: string;
  startsOn: string;
  error?: string;
  // "30-day challenge" offers 30 days. Only offered: the toggle stays theirs.
  suggestedDays?: number | null;
  onMode: (mode: EndMode) => void;
  onAfterDays: (days: string) => void;
  onEndsOn: (date: string) => void;
  onSubmitEditing?: () => void;
}

export function EndField(props: EndFieldProps) {
  const on = props.mode !== 'never';
  return (
    <View style={styles.field}>
      <ToggleRow
        label="End this habit"
        hint={!on && props.suggestedDays ? `This sounds like ${props.suggestedDays} days.` : undefined}
        value={on}
        onChange={(next) => {
          if (!next) return props.onMode('never');
          if (props.suggestedDays && !props.afterDays) props.onAfterDays(String(props.suggestedDays));
          props.onMode('after');
        }}
      />
      {on ? (
        <>
          <SegmentedControl
            options={END_OPTIONS}
            value={props.mode === 'on' ? 'on' : 'after'}
            onChange={(mode) => {
              if (mode === 'on' && !props.endsOn) props.onEndsOn(addDays(props.startsOn, 29));
              props.onMode(mode);
            }}
          />
          {props.mode === 'after' ? (
            <TextField
              label="Days"
              hint="Counted from the day it starts."
              value={props.afterDays}
              keyboardType="number-pad"
              onChangeText={props.onAfterDays}
              onSubmitEditing={props.onSubmitEditing}
            />
          ) : (
            <DateStepper
              label="Last day"
              value={props.endsOn || addDays(props.startsOn, 29)}
              min={props.startsOn}
              onChange={props.onEndsOn}
            />
          )}
          <FormMessage message={props.error} />
        </>
      ) : null}
    </View>
  );
}

export const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const readableDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`)
  );

// A date moved by days and weeks. No date picker library, and every step is a button.
export function DateStepper({ label, value, min, onChange }: { label: string; value: string; min: string; onChange: (date: string) => void }) {
  const move = (days: number) => {
    const next = addDays(value, days);
    onChange(next < min ? min : next);
  };
  return (
    <View style={styles.field}>
      <Text variant="small">{label}</Text>
      <Text numeric accessibilityLiveRegion="polite">
        {readableDate(value)}
      </Text>
      <View style={styles.chips}>
        <Chip label="−1 week" accessibilityLabel="A week earlier" selected={false} onPress={() => move(-7)} />
        <Chip label="−1 day" accessibilityLabel="A day earlier" selected={false} onPress={() => move(-1)} />
        <Chip label="+1 day" accessibilityLabel="A day later" selected={false} onPress={() => move(1)} />
        <Chip label="+1 week" accessibilityLabel="A week later" selected={false} onPress={() => move(7)} />
      </View>
    </View>
  );
}

const STEP_MINUTES = 15;

const shiftTime = (time: string, minutes: number) => {
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const clockLabel = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

// A reminder time, or none. Fifteen minutes or an hour at a time.
export function ReminderField({ value, fallback, onChange }: { value: string | null; fallback: string; onChange: (time: string | null) => void }) {
  return (
    <View style={styles.field}>
      <ToggleRow label="Remind me" value={value !== null} onChange={(on) => onChange(on ? fallback : null)} />
      {value ? (
        <>
          <Text numeric accessibilityLiveRegion="polite">
            {clockLabel(value)}
          </Text>
          <View style={styles.chips}>
            <Chip label="−1 hour" accessibilityLabel="An hour earlier" selected={false} onPress={() => onChange(shiftTime(value, -60))} />
            <Chip label={`−${STEP_MINUTES} min`} accessibilityLabel="15 minutes earlier" selected={false} onPress={() => onChange(shiftTime(value, -STEP_MINUTES))} />
            <Chip label={`+${STEP_MINUTES} min`} accessibilityLabel="15 minutes later" selected={false} onPress={() => onChange(shiftTime(value, STEP_MINUTES))} />
            <Chip label="+1 hour" accessibilityLabel="An hour later" selected={false} onPress={() => onChange(shiftTime(value, 60))} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
