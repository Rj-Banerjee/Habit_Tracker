'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  addDays,
  dayName,
  groupHabits,
  layout,
  Reflection,
  space,
  weekCompletion,
  weekDates,
  weekLabel,
  weekStart,
} from '@habit-tracker/core';
import { Button, FormMessage, StatusMark, Text, TextField, useShortcut, useTheme } from '@habit-tracker/ui';
import { useAuth } from '../../hooks/useAuth';
import { useHabitRange } from '../../hooks/useHabitRange';
import { useToday } from '../../hooks/useToday';
import { tracker } from '../../services/tracker';

const MARK_SIZE = 22;
const EMPTY = { wins: ['', '', ''], mood: '', note: '' };

export function WeekReview() {
  const { today, failed } = useToday();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [offset, setOffset] = useState(0);
  const start = addDays(weekStart(today ?? '2000-01-03'), offset * 7);
  const dates = useMemo(() => weekDates(start), [start]);
  const range = useHabitRange(dates[0], dates[6], today);

  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useShortcut('[', () => setOffset((o) => o - 1));
  useShortcut(']', () => setOffset((o) => Math.min(0, o + 1)));

  useEffect(() => {
    if (!today) return;
    let current = true;
    tracker
      .getReflection(start)
      .then((reflection) => {
        if (!current) return;
        setSaved(false);
        setMessage(null);
        setForm(
          reflection
            ? {
                wins: [0, 1, 2].map((i) => reflection.wins[i] ?? ''),
                mood: reflection.mood_line ?? '',
                note: reflection.month_note ?? '',
              }
            : EMPTY
        );
      })
      .catch(() => current && setMessage("Your reflection couldn't load."));
    return () => {
      current = false;
    };
  }, [start, today]);

  const edit = (patch: Partial<typeof EMPTY>) => {
    setForm((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const save = async () => {
    if (!session) return;
    const reflection: Reflection = {
      week_start: start,
      wins: form.wins.map((win) => win.trim()).filter(Boolean),
      mood_line: form.mood.trim() || null,
      month_note: form.note.trim() || null,
    };
    setSaving(true);
    setMessage(null);
    try {
      await tracker.saveReflection(session.user.id, reflection);
      setSaved(true);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (failed || range.loadFailed) {
    return (
      <View style={styles.page}>
        <Text>This week couldn&apos;t load.</Text>
        <Button label="Try again" onPress={range.refresh} />
      </View>
    );
  }

  if (!today || range.loading) {
    return <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading your week" />;
  }

  const groups = groupHabits(range.habits);

  return (
    <View style={styles.page}>
      <View style={styles.toolbar}>
        <Button quiet label="‹" onPress={() => setOffset(offset - 1)} accessibilityLabel="Previous week" />
        <Text variant="title" numeric accessibilityRole="header">
          {weekLabel(start)}
        </Text>
        <Button
          quiet
          label="›"
          disabled={offset === 0}
          onPress={() => setOffset(offset + 1)}
          accessibilityLabel="Next week"
        />
      </View>

      {groups.length === 0 ? (
        <Text muted>Nothing was scheduled this week.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.identityId} style={styles.group}>
            <Text variant="small" muted accessibilityRole="header">
              {group.name}
            </Text>
            {group.habits.map((habit) => {
              const statuses = dates.map((date) => range.statusOf(habit.id, date));
              const completion = weekCompletion(statuses);
              return (
                <View
                  key={habit.id}
                  style={styles.row}
                  accessible
                  accessibilityLabel={`${habit.title}, ${completion}`}
                >
                  <Text style={styles.title} numberOfLines={1}>
                    {habit.title}
                  </Text>
                  <View style={styles.marks}>
                    {statuses.map((status, index) => (
                      <View key={dates[index]} style={styles.mark}>
                        <Text variant="small" muted>
                          {dayName(dates[index]).charAt(0)}
                        </Text>
                        {status ? (
                          <StatusMark status={status} identity={group.colour} size={MARK_SIZE} />
                        ) : (
                          <View style={styles.blank} />
                        )}
                      </View>
                    ))}
                  </View>
                  <Text variant="small" muted numeric style={styles.count}>
                    {completion}
                  </Text>
                </View>
              );
            })}
          </View>
        ))
      )}

      <View style={styles.group}>
        <Text accessibilityRole="header">Three wins</Text>
        {form.wins.map((win, index) => (
          <TextField
            key={index}
            label={`Win ${index + 1}`}
            value={win}
            maxLength={200}
            onChangeText={(value) =>
              edit({ wins: form.wins.map((w, i) => (i === index ? value : w)) })
            }
          />
        ))}
      </View>

      <TextField
        label="One line on how the week felt"
        value={form.mood}
        maxLength={200}
        onChangeText={(mood) => edit({ mood })}
      />
      <TextField
        label="Note"
        value={form.note}
        maxLength={2000}
        multiline
        style={styles.note}
        onChangeText={(note) => edit({ note })}
      />

      <FormMessage message={message ?? (saved ? 'Saved.' : null)} />
      <Button label={saving ? 'Saving' : 'Save'} disabled={saving} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.xl, width: '100%', maxWidth: layout.readingWidth + 160, alignSelf: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  group: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  title: { flex: 1, minWidth: 140 },
  marks: { flexDirection: 'row', gap: space.xs },
  mark: { alignItems: 'center', gap: 2, width: 28 },
  blank: { width: MARK_SIZE, height: MARK_SIZE },
  count: { width: 72, textAlign: 'right' },
  note: { minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' },
});
