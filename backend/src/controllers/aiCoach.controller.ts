import { Request, Response, NextFunction } from 'express';
import { aiCoachService } from '../services/aiCoachService';
import { AppError } from '../middlewares/error.middleware';

export class AICoachController {
  /**
   * GET /api/ai/chat
   * Retrieves message history for the authenticated user
   */
  async getChatHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const limit = Number(req.query.limit) || 40;
      const messages = await aiCoachService.getChatHistory(userId, limit);

      res.json({
        status: 'success',
        data: messages,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/ai/chat
   * Standard JSON chat response with tool executions
   */
  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { message, currentDate } = req.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        throw new AppError('Message is required and must be non-empty', 400);
      }

      const result = await aiCoachService.processMessage(userId, message.trim(), currentDate);

      res.json({
        status: 'success',
        data: {
          response: result.response,
          toolsExecuted: result.toolsExecuted,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/ai/chat/stream
   * Server-Sent Events (SSE) streaming endpoint for real-time typewriter experience
   */
  async streamMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { message, currentDate } = req.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        throw new AppError('Message is required and must be non-empty', 400);
      }

      // Configure SSE response headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      res.write(': keepalive\n\n');

      const result = await aiCoachService.processMessage(userId, message.trim(), currentDate);

      // Stream the response in natural rhythmic chunks
      const words = result.response.split(' ');
      let currentChunk = '';

      for (let i = 0; i < words.length; i++) {
        currentChunk += (i === 0 ? '' : ' ') + words[i];
        if (i % 3 === 0 || i === words.length - 1) {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: currentChunk })}\n\n`);
          currentChunk = '';
          // Small synthetic delay for smooth streaming feel
          await new Promise((r) => setTimeout(r, 20));
        }
      }

      // Send completion event with tools executed for state syncing
      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          fullText: result.response,
          toolsExecuted: result.toolsExecuted,
        })}\n\n`
      );

      res.end();
    } catch (error) {
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: (error as Error).message })}\n\n`);
        res.end();
      } else {
        next(error);
      }
    }
  }

  /**
   * GET /api/ai/profile
   * Retrieves coach profile and behavioral parameters
   */
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const profile = await aiCoachService.getOrCreateProfile(userId);

      res.json({
        status: 'success',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/ai/profile
   * Updates coaching style, target identity, and behavioral tags
   */
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { coachingStyle, targetIdentity, behavioralTags } = req.body;

      const profile = await aiCoachService.updateProfile(userId, {
        coachingStyle,
        targetIdentity,
        behavioralTags,
      });

      res.json({
        status: 'success',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/ai/chat
   * Clears the user's AI coach chat history
   */
  async clearHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      await aiCoachService.clearChatHistory(userId);

      res.json({
        status: 'success',
        message: 'Chat history cleared successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/ai/proactive-check
   * Manually dispatches proactive check-in (useful for testing and instant sync)
   */
  async triggerProactiveCheck(req: Request, res: Response, next: NextFunction) {
    try {
      const { slot } = req.body;
      const result = await aiCoachService.checkAndDispatchProactiveMessages(slot);

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const aiCoachController = new AICoachController();
