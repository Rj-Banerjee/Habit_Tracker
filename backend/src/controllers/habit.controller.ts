import { Request, Response, NextFunction } from 'express';
import { habitService } from '../services/habit.service';

export class HabitController {
  // DAILY HABITS
  async getDailyHabits(req: Request, res: Response, next: NextFunction) {
    try {
      const habits = await habitService.getDailyHabits(req.user!.id);
      res.json({ status: 'success', data: habits });
    } catch (err) {
      next(err);
    }
  }

  async getMonthMatrix(req: Request, res: Response, next: NextFunction) {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const matrix = await habitService.getMonthMatrix(req.user!.id, year, month);
      res.json({ status: 'success', data: matrix });
    } catch (err) {
      next(err);
    }
  }

  async createDailyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const habit = await habitService.createDailyHabit(req.user!.id, req.body);
      res.status(201).json({ status: 'success', data: habit });
    } catch (err) {
      next(err);
    }
  }

  async updateDailyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const habit = await habitService.updateDailyHabit(req.user!.id, req.params.id, req.body);
      res.json({ status: 'success', data: habit });
    } catch (err) {
      next(err);
    }
  }

  async deleteDailyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await habitService.deleteDailyHabit(req.user!.id, req.params.id);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  }

  async toggleDailyLog(req: Request, res: Response, next: NextFunction) {
    try {
      const log = await habitService.toggleDailyLog(req.user!.id, {
        habitId: req.body.habitId,
        date: req.body.date,
        isCompleted: req.body.isCompleted,
      });
      res.json({ status: 'success', data: log });
    } catch (err) {
      next(err);
    }
  }

  // WEEKLY HABITS
  async getWeeklyHabits(req: Request, res: Response, next: NextFunction) {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const habits = await habitService.getWeeklyHabits(req.user!.id, year, month);
      res.json({ status: 'success', data: habits });
    } catch (err) {
      next(err);
    }
  }

  async createWeeklyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const habit = await habitService.createWeeklyHabit(req.user!.id, req.body);
      res.status(201).json({ status: 'success', data: habit });
    } catch (err) {
      next(err);
    }
  }

  async toggleWeeklyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const habit = await habitService.toggleWeeklyHabit(req.user!.id, req.params.id);
      res.json({ status: 'success', data: habit });
    } catch (err) {
      next(err);
    }
  }

  async deleteWeeklyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await habitService.deleteWeeklyHabit(req.user!.id, req.params.id);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  }

  // MONTHLY HABITS
  async getMonthlyHabits(req: Request, res: Response, next: NextFunction) {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const habits = await habitService.getMonthlyHabits(req.user!.id, year, month);
      res.json({ status: 'success', data: habits });
    } catch (err) {
      next(err);
    }
  }

  async createMonthlyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const habit = await habitService.createMonthlyHabit(req.user!.id, req.body);
      res.status(201).json({ status: 'success', data: habit });
    } catch (err) {
      next(err);
    }
  }

  async toggleMonthlyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const habit = await habitService.toggleMonthlyHabit(req.user!.id, req.params.id);
      res.json({ status: 'success', data: habit });
    } catch (err) {
      next(err);
    }
  }

  async deleteMonthlyHabit(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await habitService.deleteMonthlyHabit(req.user!.id, req.params.id);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const habitController = new HabitController();
