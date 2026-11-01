import { Router } from 'express';
import { z } from 'zod';
import { aiCoachController } from '../controllers/aiCoach.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';

const router = Router();

const chatBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(50)
    .optional(),
  message: z.string().max(4000).optional(),
  currentDate: z.iso.date().optional(),
});

// Secure all AI Coach endpoints with Supabase Auth
router.use(requireAuth);

// Chat endpoints
router.get('/chat', aiCoachController.getChatHistory);

router.post(
  '/chat',
  validateRequest({ body: chatBody }),
  aiCoachController.sendMessage
);

router.post(
  '/chat/stream',
  validateRequest({ body: chatBody }),
  aiCoachController.streamMessage
);

router.delete('/chat', aiCoachController.clearHistory);

// Coach Profile
router.get('/profile', aiCoachController.getProfile);

router.patch(
  '/profile',
  validateRequest({
    body: z.object({
      coachingStyle: z.string().max(50).optional(),
      targetIdentity: z.string().max(200).optional(),
      behavioralTags: z.array(z.string().max(50)).max(20).optional(),
    }),
  }),
  aiCoachController.updateProfile
);

export default router;
