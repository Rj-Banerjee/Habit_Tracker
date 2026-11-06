import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { layout, radius, space, VOICE_UNDO_SECONDS } from '@habit-tracker/core';
import { Button, Text, useTheme } from '@habit-tracker/ui';
import { VoiceBanner } from '../hooks/useVoice';

interface UndoBannerProps {
  banner: VoiceBanner;
  onUndo: () => void;
  onExpire: () => void;
}

export function UndoBanner({ banner, onUndo, onExpire }: UndoBannerProps) {
  const { colors, radii } = useTheme();

  useEffect(() => {
    const timer = setTimeout(onExpire, VOICE_UNDO_SECONDS * 1000);
    return () => clearTimeout(timer);
    // A new log restarts the 10 seconds, and nothing else should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner.id]);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.banner, { borderRadius: radii.md }, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.text}>
        <Text variant="small" numeric>
          {banner.text}
        </Text>
        {banner.heard ? (
          <Text variant="small" muted>
            {banner.heard}
          </Text>
        ) : null}
      </View>
      {banner.canUndo ? <Button label="Undo" quiet onPress={onUndo} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    maxWidth: layout.readingWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1 },
});
