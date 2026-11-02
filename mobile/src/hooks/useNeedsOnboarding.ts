import { useEffect, useState } from 'react';
import { restoreDailyReminder } from '../services/reminders';
import { tracker } from '../services/tracker';

// Undefined until it's known. Any failure means no: Today works without this, and
// nobody should be held at a welcome screen by a bad connection.
export function useNeedsOnboarding() {
  const [needed, setNeeded] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    Promise.all([tracker.getProfile(), tracker.listProgressHabits()])
      .then(([profile, habits]) => {
        setNeeded(!profile.onboarded_at && habits.length === 0);
        void restoreDailyReminder(profile.reminder_time?.slice(0, 5) ?? null);
      })
      .catch(() => setNeeded(false));
  }, []);

  return { needed, finished: () => setNeeded(false) };
}
