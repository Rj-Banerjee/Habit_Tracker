import { useEffect, useState } from 'react';
import { reportRange, WeeklyReport, weeklyReport } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// The weekly report for the week starting on weekStart, or null until it loads (or if it
// can't: the Sunday Review works without it). Pass an empty string to skip loading.
export function useWeeklyReport(weekStart: string) {
  const [report, setReport] = useState<{ weekStart: string; report: WeeklyReport } | null>(null);

  useEffect(() => {
    if (!weekStart) return;
    let live = true;
    const { from, to } = reportRange(weekStart);
    // Any failure, even one thrown at once, just leaves the report out.
    Promise.resolve()
      .then(() => tracker.getAnalytics(from, to))
      .then((data) => live && setReport({ weekStart, report: weeklyReport(data, weekStart) }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [weekStart]);

  return report?.weekStart === weekStart ? report.report : null;
}
