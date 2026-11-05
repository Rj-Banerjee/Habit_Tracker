import React, { useEffect, useState } from 'react';
import { Identity, MISS_REASONS, MissReason, RepairRow } from '@habit-tracker/core';
import { BottomSheet, SheetOption, Text } from '@habit-tracker/ui';
import { tracker } from '../services/tracker';
import { WhyCard } from './WhyCard';

interface MissReviewProps {
  visible: boolean;
  repair: RepairRow | null;
  onChoose: (reason: MissReason, label: string) => void;
  onClose: () => void;
}

export function MissReview({ visible, repair, onChoose, onClose }: MissReviewProps) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const identityId = repair?.identity_id;

  // Only here to encourage, so if it can't load the review carries on without it.
  useEffect(() => {
    if (!visible || !identityId) return;
    tracker
      .listIdentities()
      .then((list) => setIdentity(list.find((item) => item.id === identityId) ?? null))
      .catch(() => {});
  }, [visible, identityId]);

  return (
    <BottomSheet visible={visible} title={`${repair?.title} slipped`} onClose={onClose}>
      <Text muted>That happens. What got in the way?</Text>
      {identity?.why_text ? (
        <WhyCard name={identity.name} why={identity.why_text} identity={identity.colour_token} />
      ) : null}
      {MISS_REASONS.map(({ value, label }) => (
        <SheetOption key={value} label={label} onPress={() => onChoose(value, label)} />
      ))}
      <SheetOption label="Not now" onPress={onClose} />
    </BottomSheet>
  );
}
