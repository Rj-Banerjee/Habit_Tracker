import { Router } from 'express';
import { contentController } from '../controllers/content.controller';

const router = Router();

// Publicly accessible daily quote & image
router.get('/quote', contentController.getDailyQuote);
router.post('/quote/refresh', contentController.forceRefreshQuote);

export default router;
