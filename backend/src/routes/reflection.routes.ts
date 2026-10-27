import { Router } from 'express';
import { z } from 'zod';
import { reflectionController } from '../controllers/reflection.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', reflectionController.getReflection);

router.post(
  '/',
  validateRequest({
    body: z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020).max(2100),
      content: z.string(),
    }),
  }),
  reflectionController.saveReflection
);

router.post(
  '/generate',
  validateRequest({
    body: z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020).max(2100),
    }),
  }),
  reflectionController.autoGenerateReflection
);

export default router;
