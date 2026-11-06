import React, { useState } from 'react';
import { Pressable, StyleSheet, Text as PlainText, View } from 'react-native';
import {
  ACCENT_IDS,
  ACCENT_SWATCHES,
  AccentId,
  FONT_FAMILIES,
  FONT_FAMILY_IDS,
  IDENTITY_TOKENS,
  IdentityToken,
  layout,
  space,
  STANDARD_THEMES,
  ThemeData,
} from '@habit-tracker/core';
import { Button } from './Button';
import { Chip } from './Chip';
import { PressableState } from './desktop';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

// Settings for the look: a theme, a typeface, and a colour for each identity. Everything
// applies at once and is remembered on this device.
export function ThemePicker() {
  const { choice, setChoice } = useTheme();
  const [colouring, setColouring] = useState(false);
  const pickTheme = (themeId: string) => setChoice({ ...choice, themeId });

  return (
    <View style={styles.root}>
      <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="Theme">
        {STANDARD_THEMES.map((t) => (
          <ThemeTile key={t.id} theme={t} selected={t.id === choice.themeId} onPress={() => pickTheme(t.id)} />
        ))}
      </View>

      <Text variant="small" muted>
        Typeface
      </Text>
      <View style={styles.wrap}>
        <Chip label="Theme's own" selected={!choice.font} onPress={() => setChoice({ ...choice, font: undefined })} />
        {FONT_FAMILY_IDS.map((id) => (
          <Chip
            key={id}
            label={FONT_FAMILIES[id].label}
            selected={choice.font === id}
            onPress={() => setChoice({ ...choice, font: id })}
          />
        ))}
      </View>

      <Button
        label={colouring ? 'Done with identity colours' : 'Change identity colours'}
        quiet
        onPress={() => setColouring(!colouring)}
      />
      {colouring ? <IdentityColours /> : null}
    </View>
  );
}

function ThemeTile({ theme, selected, onPress }: { theme: ThemeData; selected: boolean; onPress: () => void }) {
  const { name, colors } = useTheme();
  const mode = theme.modes[name];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={theme.name}
      accessibilityState={{ selected, checked: selected }}
      style={({ focused }: PressableState) => [
        styles.tile,
        {
          backgroundColor: mode.colors.canvas,
          borderRadius: theme.radii.md,
          borderColor: selected || focused ? colors.text : mode.colors.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={[styles.preview, { backgroundColor: mode.colors.surface, borderRadius: theme.radii.sm }]}>
        {(['identity-1', 'identity-3', 'identity-5'] as IdentityToken[]).map((token) => (
          <View key={token} style={[styles.dot, { backgroundColor: mode.identity[token].accent }]} />
        ))}
      </View>
      {/* The name in the theme's own typeface and colours, so the tile is a real preview. */}
      <PlainText
        numberOfLines={1}
        style={{ fontFamily: theme.typography.fonts.medium, fontSize: 13, lineHeight: 18, color: mode.colors.text }}
      >
        {theme.name}
      </PlainText>
    </Pressable>
  );
}

function IdentityColours() {
  const { choice, setChoice, identity, name, colors } = useTheme();
  const pick = (token: IdentityToken, id: AccentId) =>
    setChoice({ ...choice, accents: { ...choice.accents, [token]: id } });

  return (
    <View style={styles.root}>
      {IDENTITY_TOKENS.map((token, index) => (
        <View key={token} style={styles.identity}>
          <Text variant="small" muted>{`Identity ${index + 1}: ${identity(token).label}`}</Text>
          <View style={styles.wrap}>
            {ACCENT_IDS.map((id) => {
              const swatch = ACCENT_SWATCHES[id];
              const selected = identity(token).accent === swatch[name];
              return (
                <Pressable
                  key={id}
                  onPress={() => pick(token, id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${swatch.label} for identity ${index + 1}`}
                  accessibilityState={{ selected }}
                  style={({ focused }: PressableState) => [
                    styles.swatch,
                    { borderColor: selected || focused ? colors.text : 'transparent' },
                  ]}
                >
                  <View style={[styles.swatchDot, { backgroundColor: swatch[name] }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Button label="Reset identity colours" quiet onPress={() => setChoice({ ...choice, accents: undefined })} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: 96, minHeight: layout.minTouchTarget, padding: space.sm, gap: space.xs },
  preview: { flexDirection: 'row', gap: space.xs, padding: space.xs },
  dot: { width: 12, height: 12, borderRadius: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  identity: { gap: space.xs },
  swatch: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.minTouchTarget / 2,
    borderWidth: 2,
  },
  swatchDot: { width: 28, height: 28, borderRadius: 14 },
});
