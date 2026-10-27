'use client';

import { useState, useEffect, useCallback } from 'react';
import { analyticsService } from '../services/analyticsService';
import { MonthAnalytics } from '../types';

export function useAnalytics(year: number, month: number) {
  const [analytics, setAnalytics] = useState<MonthAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await analyticsService.getMonthAnalytics(year, month);
      setAnalytics(data);
    } catch {
      // Analytics fallback
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    analytics,
    loading,
    refreshAnalytics: fetchAnalytics,
  };
}
