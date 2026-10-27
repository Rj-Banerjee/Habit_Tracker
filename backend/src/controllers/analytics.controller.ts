import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics.service';

export class AnalyticsController {
  async getMonthAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const data = await analyticsService.getMonthAnalytics(req.user!.id, year, month);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  }
}

export const analyticsController = new AnalyticsController();
