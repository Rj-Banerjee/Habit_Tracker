import React from 'react';
import { Text } from './Text';

export function FormMessage({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text variant="small" muted accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}
