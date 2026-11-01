import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FIELD_LIMITS, Identity, space } from '@habit-tracker/core';
import { Chip, ColourPicker, FormMessage, Text, TextField } from '@habit-tracker/ui';
import { NewIdentity } from '../hooks/useHabitForm';

interface IdentitySectionProps {
  identities: Identity[];
  selectedId: string | null;
  draft: NewIdentity | null;
  error?: string;
  onChoose: (id: string) => void;
  onToggleNew: () => void;
  onDraftChange: (draft: NewIdentity) => void;
}

export function IdentitySection({
  identities,
  selectedId,
  draft,
  error,
  onChoose,
  onToggleNew,
  onDraftChange,
}: IdentitySectionProps) {
  return (
    <View style={styles.section}>
      <Text variant="small">Identity</Text>
      {identities.length > 0 ? (
        <View style={styles.chips}>
          {identities.map((identity) => (
            <Chip
              key={identity.id}
              label={identity.name}
              selected={!draft && identity.id === selectedId}
              onPress={() => onChoose(identity.id)}
            />
          ))}
          <Chip label="New identity" selected={!!draft} onPress={onToggleNew} />
        </View>
      ) : null}
      {draft ? (
        <View style={styles.section}>
          <TextField
            label="Identity name"
            value={draft.name}
            maxLength={FIELD_LIMITS.identityName}
            error={error}
            onChangeText={(name) => onDraftChange({ ...draft, name })}
          />
          <Text variant="small">Colour</Text>
          <ColourPicker
            value={draft.colourToken}
            onChange={(colourToken) => onDraftChange({ ...draft, colourToken })}
          />
          <TextField
            label="Why this matters"
            value={draft.whyText}
            maxLength={FIELD_LIMITS.whyText}
            onChangeText={(whyText) => onDraftChange({ ...draft, whyText })}
          />
        </View>
      ) : (
        <FormMessage message={error} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
