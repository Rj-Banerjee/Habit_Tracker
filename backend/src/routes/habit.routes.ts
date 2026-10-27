import { Router } from 'express';
import { z } from 'zod';
import { habitController } from '../controllers/habit.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';

const router = Router();

// Secure all habit routes with Supabase JWT auth
router.use(requireAuth);

// Daily Habits & Matrix
router.get('/daily', habitController.getDailyHabits);
router.get('/daily/matrix', habitController.getMonthMatrix);

router.post(
  '/daily',
  validateRequest({
    body: z.object({
      title: z.string().min(1, 'Title is required').max(100),
      goalDays: z.number().int().min(1).max(31).optional(),
    }),
  }),
  habitController.createDailyHabit
);

router.patch(
  '/daily/:id',
  validateRequest({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      title: z.string().min(1).max(100).optional(),
      goalDays: z.number().int().min(1).max(31).optional(),
    }),
  }),
  habitController.updateDailyHabit
);

router.delete(
  '/daily/:id',
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  habitController.deleteDailyHabit
);

// Toggle / Optimistic Daily Log
router.post(
  '/daily/log',
  validateRequest({
    body: z.object({
      habitId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted YYYY-MM-DD'),
      isCompleted: z.boolean().optional(),
    }),
  }),
  habitController.toggleDailyLog
);

// Weekly Habits
router.get('/weekly', habitController.getWeeklyHabits);

router.post(
  '/weekly',
  validateRequest({
    body: z.object({
      title: z.string().min(1).max(100),
      weekNumber: z.number().int().min(1).max(5),
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020).max(2100),
    }),
  }),
  habitController.createWeeklyHabit
);

router.patch(
  '/weekly/:id/toggle',
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  habitController.toggleWeeklyHabit
);

router.delete(
  '/weekly/:id',
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  habitController.deleteWeeklyHabit
);

// Monthly Habits
router.get('/monthly', habitController.getMonthlyHabits);

router.post(
  '/monthly',
  validateRequest({
    body: z.object({
      title: z.string().min(1).max(100),
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020).max(2100),
    }),
  }),
  habitController.createMonthlyHabit
);

router.patch(
  '/monthly/:id/toggle',
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  habitController.toggleMonthlyHabit
);

router.delete(
  '/monthly/:id',
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  habitController.deleteMonthlyHabit
);

export default router;
