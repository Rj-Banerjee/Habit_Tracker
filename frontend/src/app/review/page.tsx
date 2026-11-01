'use client';

import { AppShell } from '../../components/AppShell';
import { WeekReview } from '../../components/review/WeekReview';

export default function ReviewPage() {
  return (
    <AppShell>
      <WeekReview />
    </AppShell>
  );
}
