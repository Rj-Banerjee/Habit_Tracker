import { Request, Response, NextFunction } from 'express';
import { quoteService } from '../services/quote.service';

export class ContentController {
  async getDailyQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const quote = await quoteService.getDailyQuote();
      res.json({ status: 'success', data: quote });
    } catch (err) {
      next(err);
    }
  }

  async forceRefreshQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const quote = await quoteService.refreshDailyQuote();
      res.json({ status: 'success', data: quote });
    } catch (err) {
      next(err);
    }
  }
}

export const contentController = new ContentController();
