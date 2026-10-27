import { Router } from 'express';
import habitRoutes from './habit.routes';
import analyticsRoutes from './analytics.routes';
import contentRoutes from './content.routes';
import reflectionRoutes from './reflection.routes';

const router = Router();

router.use('/habits', habitRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/content', contentRoutes);
router.use('/reflections', reflectionRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'habit-tracker-api',
  });
});

export default router;
