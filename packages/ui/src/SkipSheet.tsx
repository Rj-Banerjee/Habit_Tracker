import React, { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { SheetOption } from './SheetOption';
import { Text } from './Text';
import { TextField } from './TextField';

const REASONS = ['Sick', 'Travelling', 'Rest day', 'Too busy'];

interface SkipSheetProps {
  visible: boolean;
  onClose: () => void;
  onSkip: (reason: string) => void;
}

export function SkipSheet({ visible, onClose, onSkip }: SkipSheetProps) {
  const [other, setOther] = useState('');

  const choose = (reason: string) => {
    setOther('');
    onSkip(reason);
  };

  return (
    <BottomSheet visible={visible} title="Why skip today?" onClose={onClose}>
      <Text variant="small" muted>
        A skip pauses your streak. You get 2 in any 7 days.
      </Text>
      {REASONS.map((reason) => (
        <SheetOption key={reason} label={reason} onPress={() => choose(reason)} />
      ))}
      <TextField label="Another reason" value={other} onChangeText={setOther} maxLength={200} />
      <Button label="Skip" disabled={other.trim() === ''} onPress={() => choose(other.trim())} />
    </BottomSheet>
  );
}
