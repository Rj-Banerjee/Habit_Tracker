import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import {
  FORECAST_RATE_MAX,
  FORECAST_RATE_MIN,
  forecast,
  ProgressDay,
  ProgressHabit,
  space,
} from '@habit-tracker/core';
import { Text, useTheme } from '@habit-tracker/ui';

interface ForecasterProps {
  habit: ProgressHabit;
  days: ProgressDay[];
  today: string;
}

export function Forecaster({ habit, days, today }: ForecasterProps) {
  const { colors } = useTheme();
  const [rate, setRate] = useState<number | null>(null);
  const actual = forecast(habit, days, today);

  if (!actual) {
    return (
      <Text variant="small" muted>
        A forecast needs a week of history.
      </Text>
    );
  }

  const shown = rate === null ? actual : (forecast(habit, days, today, rate) ?? actual);

  return (
    <View style={styles.root}>
      <Text numeric accessibilityLiveRegion="polite">
        {shown.sentence}
      </Text>
      <Text variant="small" muted numeric>
        At {shown.rate}% consistency. Lately you&apos;ve been at {actual.actualRate}%.
      </Text>
      <Slider
        testID="forecast-rate"
        accessibilityLabel="Consistency"
        minimumValue={FORECAST_RATE_MIN}
        maximumValue={FORECAST_RATE_MAX}
        step={5}
        value={shown.rate}
        onValueChange={setRate}
        minimumTrackTintColor={colors.text}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
});
