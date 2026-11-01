import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodObject } from 'zod';
import { AppError } from './error.middleware';

export const validateRequest = (schema: {
  body?: ZodObject;
  query?: ZodObject;
  params?: ZodObject;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = (await schema.query.parseAsync(req.query)) as Request['query'];
      }
      if (schema.params) {
        req.params = (await schema.params.parseAsync(req.params)) as Request['params'];
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return next(new AppError(`Validation failed: ${errorMessages}`, 400));
      }
      next(error);
    }
  };
};
