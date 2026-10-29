import { Router } from 'express';
import habitRoutes from './habit.routes';
import analyticsRoutes from './analytics.routes';
import contentRoutes from './content.routes';
import reflectionRoutes from './reflection.routes';
import aiCoachRoutes from './aiCoach.routes';

const router = Router();

router.use('/habits', habitRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/content', contentRoutes);
router.use('/reflections', reflectionRoutes);
router.use('/ai', aiCoachRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'habit-tracker-api',
  });
});

export default router;
