import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { space } from '@habit-tracker/core';
import { SegmentedControl, Text } from '@habit-tracker/ui';
import { nudgesEnabled, setNudgesEnabled } from '../services/nudges';

const OPTIONS = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

export function NudgeSetting() {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    nudgesEnabled()
      .then((enabled) => setValue(enabled ? 'on' : 'off'))
      .catch(() => setValue('on'));
  }, []);

  if (Platform.OS === 'web' || value === null) return null;

  return (
    <View style={styles.root}>
      <Text variant="small" muted>
        Smart nudges
      </Text>
      <SegmentedControl
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          setValue(next);
          void setNudgesEnabled(next === 'on');
        }}
      />
      <Text variant="small" muted>
        At most one a day, just before you usually do a habit that needs help.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
});
