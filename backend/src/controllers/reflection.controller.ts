import { Request, Response, NextFunction } from 'express';
import { reflectionService } from '../services/reflection.service';

export class ReflectionController {
  async getReflection(req: Request, res: Response, next: NextFunction) {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const reflection = await reflectionService.getReflection(req.user!.id, year, month);
      res.json({ status: 'success', data: reflection });
    } catch (err) {
      next(err);
    }
  }

  async saveReflection(req: Request, res: Response, next: NextFunction) {
    try {
      const saved = await reflectionService.saveReflection(req.user!.id, req.body);
      res.json({ status: 'success', data: saved });
    } catch (err) {
      next(err);
    }
  }

  async autoGenerateReflection(req: Request, res: Response, next: NextFunction) {
    try {
      const year = Number(req.body.year) || new Date().getFullYear();
      const month = Number(req.body.month) || new Date().getMonth() + 1;
      const generated = await reflectionService.autoGenerateReflection(req.user!.id, year, month);
      res.json({ status: 'success', data: generated });
    } catch (err) {
      next(err);
    }
  }
}

export const reflectionController = new ReflectionController();
