'use client';

import { useEffect, useState } from 'react';
import { localDate } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// "Today" follows the timezone on the profile, not the device.
export function useToday() {
  const [today, setToday] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    tracker
      .getProfile()
      .then((profile) => setToday(localDate(profile.timezone)))
      .catch(() => setFailed(true));
  }, []);

  return { today, failed };
}
