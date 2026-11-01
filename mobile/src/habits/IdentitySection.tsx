import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Identity, space } from '@habit-tracker/core';
import { Chip, ColourPicker, FormMessage, Text, TextField } from '@habit-tracker/ui';
import { FIELD_LIMITS, NewIdentity } from '../hooks/useHabitForm';

interface IdentitySectionProps {
  identities: Identity[];
  selectedId: string | null;
  draft: NewIdentity | null;
  // A saved habit can't move to another identity yet.
  locked: boolean;
  error?: string;
  onChoose: (id: string) => void;
  onToggleNew: () => void;
  onDraftChange: (draft: NewIdentity) => void;
}

export function IdentitySection({
  identities,
  selectedId,
  draft,
  locked,
  error,
  onChoose,
  onToggleNew,
  onDraftChange,
}: IdentitySectionProps) {
  if (locked) {
    return (
      <View style={styles.section}>
        <Text variant="small">Identity</Text>
        <Text>{identities.find((identity) => identity.id === selectedId)?.name}</Text>
        <FormMessage message="Moving a habit to another identity isn't available yet." />
      </View>
    );
  }

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
