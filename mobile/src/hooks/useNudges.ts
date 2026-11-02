import { useEffect, useRef } from 'react';
import { TodayRow } from '@habit-tracker/core';
import { cancelIfLogged, syncNudge } from '../services/nudges';

export function useNudges(rows: TodayRow[], loading: boolean) {
  const planned = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!planned.current) {
      planned.current = true;
      void syncNudge(rows);
    }
    void cancelIfLogged(rows);
  }, [rows, loading]);
}
