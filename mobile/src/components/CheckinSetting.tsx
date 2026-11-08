import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CheckinTime, space } from '@habit-tracker/core';
import { Button, SegmentedControl, Text } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';

const OPTIONS: { value: CheckinTime; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  // Not "Off": the nudge setting above has one.
  { value: 'off', label: 'Never' },
];

// When the daily check-in shows, and deleting every check-in made.
export function CheckinSetting() {
  const [value, setValue] = useState<CheckinTime | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve()
      .then(() => tracker.getCheckinState())
      .then((state) => setValue(state.time))
      .catch(() => setValue(null));
  }, []);

  if (value === null) return null;

  const remove = async () => {
    setDeleting(false);
    try {
      const count = await tracker.deleteCheckins();
      setNote(count === 1 ? '1 check-in deleted.' : `${count} check-ins deleted.`);
    } catch {
      setNote("They couldn't be deleted. Try again.");
    }
  };

  return (
    <View style={styles.root}>
      <Text variant="small" muted>
        Daily check-in
      </Text>
      <SegmentedControl
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          setValue(next);
          void Promise.resolve()
            .then(() => tracker.setCheckinTime(next))
            .catch(() => {});
        }}
      />
      <Text variant="small" muted>
        Energy, sleep and mood in a few taps, so you can see how they go with your habits. Only you can see it.
      </Text>
      {deleting ? (
        <View style={styles.row}>
          <Text variant="small">Delete every check-in? This can&apos;t be undone.</Text>
          <Button label="Delete" quiet onPress={() => void remove()} />
          <Button label="Cancel" quiet onPress={() => setDeleting(false)} />
        </View>
      ) : (
        <Button label="Delete my check-ins" quiet onPress={() => setDeleting(true)} />
      )}
      {note ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
});
