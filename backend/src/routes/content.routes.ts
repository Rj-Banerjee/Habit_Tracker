import { Router } from 'express';
import { contentController } from '../controllers/content.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Publicly accessible daily quote & image
router.get('/quote', contentController.getDailyQuote);
router.post('/quote/refresh', requireAuth, contentController.forceRefreshQuote);

export default router;
