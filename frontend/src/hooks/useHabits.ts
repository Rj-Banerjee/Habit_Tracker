'use client';

import { useState, useEffect, useCallback } from 'react';
import { habitService } from '../services/habitService';
import { DailyHabit, WeeklyHabit, MonthlyHabit, MonthlyReflection } from '../types';
import { useToast } from './useToast';

export function useHabits(year: number, month: number) {
  const [dailyHabits, setDailyHabits] = useState<DailyHabit[]>([]);
  const [weeklyHabits, setWeeklyHabits] = useState<WeeklyHabit[]>([]);
  const [monthlyHabits, setMonthlyHabits] = useState<MonthlyHabit[]>([]);
  const [reflection, setReflection] = useState<MonthlyReflection | null>(null);
  const [loading, setLoading] = useState(true);
  const { success, error } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [matrixData, weeklyData, monthlyData, reflectionData] = await Promise.all([
        habitService.getMonthMatrix(year, month).catch(() => []),
        habitService.getWeeklyHabits(year, month).catch(() => []),
        habitService.getMonthlyHabits(year, month).catch(() => []),
        habitService.getReflection(year, month).catch(() => null),
      ]);

      setDailyHabits(matrixData);
      setWeeklyHabits(weeklyData);
      setMonthlyHabits(monthlyData);
      setReflection(reflectionData);
    } catch (err) {
      error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [year, month, error]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // DAILY ACTIONS
  const addDailyHabit = async (title: string, goalDays: number = 30) => {
    try {
      const created = await habitService.createDailyHabit(title, goalDays);
      setDailyHabits((prev) => [...prev, created]);
      success(`Added habit: ${title}`);
      return created;
    } catch (err) {
      error((err as Error).message);
    }
  };

  const updateDailyHabit = async (id: string, title?: string, goalDays?: number) => {
    try {
      const updated = await habitService.updateDailyHabit(id, title, goalDays);
      setDailyHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...updated } : h)));
      success('Habit updated');
    } catch (err) {
      error((err as Error).message);
    }
  };

  const deleteDailyHabit = async (id: string) => {
    try {
      await habitService.deleteDailyHabit(id);
      setDailyHabits((prev) => prev.filter((h) => h.id !== id));
      success('Habit deleted');
    } catch (err) {
      error((err as Error).message);
    }
  };

  // WEEKLY ACTIONS
  const addWeeklyHabit = async (title: string, weekNumber: number) => {
    try {
      const created = await habitService.createWeeklyHabit(title, weekNumber, month, year);
      setWeeklyHabits((prev) => [...prev, created]);
      success(`Added to Week ${weekNumber}`);
    } catch (err) {
      error((err as Error).message);
    }
  };

  const toggleWeeklyHabit = async (id: string) => {
    // Optimistic toggle
    setWeeklyHabits((prev) =>
      prev.map((w) => (w.id === id ? { ...w, is_completed: !w.is_completed } : w))
    );

    try {
      await habitService.toggleWeeklyHabit(id);
    } catch (err) {
      // rollback
      setWeeklyHabits((prev) =>
        prev.map((w) => (w.id === id ? { ...w, is_completed: !w.is_completed } : w))
      );
      error('Failed to toggle weekly habit');
    }
  };

  const deleteWeeklyHabit = async (id: string) => {
    try {
      await habitService.deleteWeeklyHabit(id);
      setWeeklyHabits((prev) => prev.filter((w) => w.id !== id));
      success('Weekly habit removed');
    } catch (err) {
      error((err as Error).message);
    }
  };

  // MONTHLY ACTIONS
  const addMonthlyHabit = async (title: string) => {
    try {
      const created = await habitService.createMonthlyHabit(title, month, year);
      setMonthlyHabits((prev) => [...prev, created]);
      success('Monthly milestone added');
    } catch (err) {
      error((err as Error).message);
    }
  };

  const toggleMonthlyHabit = async (id: string) => {
    // Optimistic toggle
    setMonthlyHabits((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_completed: !m.is_completed } : m))
    );

    try {
      await habitService.toggleMonthlyHabit(id);
    } catch (err) {
      setMonthlyHabits((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_completed: !m.is_completed } : m))
      );
      error('Failed to toggle monthly habit');
    }
  };

  const deleteMonthlyHabit = async (id: string) => {
    try {
      await habitService.deleteMonthlyHabit(id);
      setMonthlyHabits((prev) => prev.filter((m) => m.id !== id));
      success('Monthly milestone removed');
    } catch (err) {
      error((err as Error).message);
    }
  };

  // REFLECTION ACTIONS
  const saveReflection = async (content: string) => {
    try {
      const saved = await habitService.saveReflection(month, year, content);
      setReflection(saved);
      success('Reflection saved');
    } catch (err) {
      error('Failed to save reflection');
    }
  };

  const autoGenerateReflection = async () => {
    try {
      const result = await habitService.autoGenerateReflection(month, year);
      setReflection({ month, year, content: result.content });
      success('Generated reflection review ✨');
    } catch (err) {
      error('Could not auto-generate reflection');
    }
  };

  return {
    dailyHabits,
    weeklyHabits,
    monthlyHabits,
    reflection,
    loading,
    refreshHabits: fetchAll,
    addDailyHabit,
    updateDailyHabit,
    deleteDailyHabit,
    addWeeklyHabit,
    toggleWeeklyHabit,
    deleteWeeklyHabit,
    addMonthlyHabit,
    toggleMonthlyHabit,
    deleteMonthlyHabit,
    saveReflection,
    autoGenerateReflection,
  };
}
