import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FIELD_LIMITS, Identity, space } from '@habit-tracker/core';
import { Button, FormMessage, Text, TextField } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';

function WhyField({ identity }: { identity: Identity }) {
  const [text, setText] = useState(identity.why_text ?? '');
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setProblem(null);
    try {
      await tracker.updateIdentityWhy(identity.id, text.trim() || null);
      setSaved(true);
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  return (
    <View style={styles.field}>
      <TextField
        label={`Why ${identity.name} matters`}
        value={text}
        maxLength={FIELD_LIMITS.whyText}
        onChangeText={(value) => {
          setText(value);
          setSaved(false);
        }}
      />
      <Button label={saved ? 'Saved' : 'Save why'} quiet onPress={() => void save()} />
      <FormMessage message={problem ?? undefined} />
    </View>
  );
}

export function WhySection() {
  const [identities, setIdentities] = useState<Identity[]>([]);

  useEffect(() => {
    tracker
      .listIdentities()
      .then(setIdentities)
      .catch(() => {});
  }, []);

  if (identities.length === 0) return null;
  return (
    <View style={styles.field}>
      <Text variant="small" muted>
        Your why
      </Text>
      {identities.map((identity) => (
        <WhyField key={identity.id} identity={identity} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
});
