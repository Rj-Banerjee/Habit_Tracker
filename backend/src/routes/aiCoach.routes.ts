import { Router } from 'express';
import { z } from 'zod';
import { aiCoachController } from '../controllers/aiCoach.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';

const router = Router();

// Secure all AI Coach endpoints with Supabase Auth
router.use(requireAuth);

// Chat endpoints
router.get('/chat', aiCoachController.getChatHistory);

router.post(
  '/chat',
  validateRequest({
    body: z.object({
      message: z.string().min(1, 'Message is required'),
      currentDate: z.string().optional(),
    }),
  }),
  aiCoachController.sendMessage
);

router.post(
  '/chat/stream',
  validateRequest({
    body: z.object({
      message: z.string().min(1, 'Message is required'),
      currentDate: z.string().optional(),
    }),
  }),
  aiCoachController.streamMessage
);

router.delete('/chat', aiCoachController.clearHistory);

// Coach Profile
router.get('/profile', aiCoachController.getProfile);

router.patch(
  '/profile',
  validateRequest({
    body: z.object({
      coachingStyle: z.string().optional(),
      targetIdentity: z.string().optional(),
      behavioralTags: z.array(z.string()).optional(),
    }),
  }),
  aiCoachController.updateProfile
);

// Proactive worker manual dispatch/test endpoint
router.post('/proactive-check', aiCoachController.triggerProactiveCheck);

export default router;
