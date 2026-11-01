import { prisma } from '../models/prisma';
import { habitService } from './habit.service';
import { ToolExecutionRecord } from '../types';
import { AppError } from '../middlewares/error.middleware';
import Anthropic from '@anthropic-ai/sdk';

// Exact dynamic system prompt requested by the user
export const ATOMIC_HABITS_SYSTEM_PROMPT = `You are an empathetic, world-class behavioral coach built into a habit-tracking app. 
RULE 1: Never use canned, robotic greetings. 
RULE 2: Always respond directly and authentically to the user's specific input first (e.g., if they are lonely, validate their feelings; if they introduce themselves, use their name). 
RULE 3: Only after validating their input, gently steer the conversation back to their daily systems and habits. 
RULE 4: If they express extreme fatigue or burnout, explicitly offer to trigger an 'Emergency Downscale' using your tools to lower their habit friction.`;

export interface DailyHabitsStatusResult {
  date: string;
  totalHabits: number;
  completedCount: number;
  incompleteCount: number;
  completedHabits: Array<{ id: string; title: string; goalDays: number }>;
  incompleteHabits: Array<{ id: string; title: string; goalDays: number }>;
}

export interface ToggleHabitResult {
  success: boolean;
  habitId: string;
  date: string;
  status: boolean;
  habitTitle: string;
  message: string;
}

export interface ScaleHabitResult {
  success: boolean;
  habitId: string;
  newGoal: number;
  previousGoal: number;
  habitTitle: string;
  message: string;
}

export interface InputChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class AICoachService {
  private anthropic: Anthropic | null = null;

  constructor() {
    this.initClients();
  }

  private initClients() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  // =========================================================================
  // 1. STRICTLY TYPED AUTONOMOUS TOOLS EXPOSED TO THE LLM
  // =========================================================================

  /**
   * Tool 1: getDailyHabits(userId)
   * Fetches daily logs and completed/incomplete habits for the current date from Supabase/Prisma.
   */
  async getDailyHabits(userId: string, targetDate?: string): Promise<DailyHabitsStatusResult> {
    const dateKey = targetDate || new Date().toISOString().split('T')[0];

    const habits = await prisma.dailyHabits.findMany({
      where: { user_id: userId },
      include: {
        logs: {
          where: { date: dateKey },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const completedHabits: Array<{ id: string; title: string; goalDays: number }> = [];
    const incompleteHabits: Array<{ id: string; title: string; goalDays: number }> = [];

    for (const habit of habits) {
      const isCompleted = habit.logs.length > 0 && habit.logs[0].is_completed;
      const habitInfo = { id: habit.id, title: habit.title, goalDays: habit.goal_days };
      if (isCompleted) {
        completedHabits.push(habitInfo);
      } else {
        incompleteHabits.push(habitInfo);
      }
    }

    return {
      date: dateKey,
      totalHabits: habits.length,
      completedCount: completedHabits.length,
      incompleteCount: incompleteHabits.length,
      completedHabits,
      incompleteHabits,
    };
  }

  /**
   * Tool 2: toggleHabitLog(habitId, date, status)
   * Creates or updates a DailyLog row in Supabase/Prisma.
   */
  async toggleHabitLog(
    userId: string,
    habitId: string,
    date: string,
    status: boolean
  ): Promise<ToggleHabitResult> {
    const habit = await prisma.dailyHabits.findFirst({
      where: { id: habitId, user_id: userId },
    });

    if (!habit) {
      throw new Error(`Habit not found with id: ${habitId}`);
    }

    const log = await habitService.toggleDailyLog(userId, {
      habitId,
      date,
      isCompleted: status,
    });

    return {
      success: true,
      habitId,
      date,
      status: log.is_completed,
      habitTitle: habit.title,
      message: `Habit "${habit.title}" marked as ${log.is_completed ? 'completed' : 'incomplete'} for ${date}.`,
    };
  }

  /**
   * Tool 3: scaleHabitTarget(habitId, newGoal)
   * Dynamically lowers habit goal parameters when user burnout is detected.
   */
  async scaleHabitTarget(
    userId: string,
    habitId: string,
    newGoal: number
  ): Promise<ScaleHabitResult> {
    const habit = await prisma.dailyHabits.findFirst({
      where: { id: habitId, user_id: userId },
    });

    if (!habit) {
      throw new Error(`Habit not found with id: ${habitId}`);
    }

    const previousGoal = habit.goal_days;
    // Scale the goal down to reduce friction
    const sanitizedGoal = Math.max(1, Math.min(newGoal, previousGoal));

    const updated = await prisma.dailyHabits.update({
      where: { id: habitId },
      data: { goal_days: sanitizedGoal },
    });

    return {
      success: true,
      habitId,
      newGoal: updated.goal_days,
      previousGoal,
      habitTitle: habit.title,
      message: `Downscaled "${habit.title}" monthly goal from ${previousGoal} to ${sanitizedGoal} days to eliminate friction.`,
    };
  }

  // =========================================================================
  // 2. COACH PROFILE & MEMORY RAG
  // =========================================================================

  async getOrCreateProfile(userId: string) {
    let profile = await prisma.coachProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await prisma.coachProfile.create({
        data: {
          userId,
          coachingStyle: 'EMPATHETIC_FIRM',
          targetIdentity: 'High-performing & disciplined builder',
          behavioralTags: ['atomic-habits', 'frictionless-downshifting', 'identity-based'],
        },
      });
    }

    return profile;
  }

  async updateProfile(
    userId: string,
    data: { coachingStyle?: string; targetIdentity?: string; behavioralTags?: string[] }
  ) {
    return prisma.coachProfile.upsert({
      where: { userId },
      update: {
        ...(data.coachingStyle && { coachingStyle: data.coachingStyle }),
        ...(data.targetIdentity !== undefined && { targetIdentity: data.targetIdentity }),
        ...(data.behavioralTags && { behavioralTags: data.behavioralTags }),
      },
      create: {
        userId,
        coachingStyle: data.coachingStyle || 'EMPATHETIC_FIRM',
        targetIdentity: data.targetIdentity || 'High-performing & disciplined builder',
        behavioralTags: data.behavioralTags || ['atomic-habits'],
      },
    });
  }

  async getChatHistory(userId: string, limit: number = 40) {
    const newestFirst = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return newestFirst.reverse();
  }

  async clearChatHistory(userId: string) {
    await prisma.chatMessage.deleteMany({
      where: { userId },
    });
    return { success: true };
  }

  // =========================================================================
  // 3. BACKGROUND PROACTIVE CRON WORKER (12:00 PM & 9:00 PM)
  // =========================================================================

  async checkAndDispatchProactiveMessages(forceSlot?: '12pm' | '9pm') {
    const now = new Date();
    const currentHour = now.getHours();
    const isEvening = forceSlot ? forceSlot === '9pm' : currentHour >= 18;
    const timeSlot: '12pm' | '9pm' = isEvening ? '9pm' : '12pm';
    const todayStr = now.toISOString().split('T')[0];

    const users = await prisma.users.findMany({
      select: { id: true, email: true },
    });

    let dispatchedCount = 0;

    for (const user of users) {
      const habitsStatus = await this.getDailyHabits(user.id, todayStr);

      if (habitsStatus.completedCount === 0 && habitsStatus.totalHabits > 0) {
        const existingMessage = await prisma.chatMessage.findFirst({
          where: {
            userId: user.id,
            role: 'assistant',
            metadata: {
              path: ['slot'],
              equals: timeSlot,
            },
            createdAt: {
              gte: new Date(`${todayStr}T00:00:00.000Z`),
            },
          },
        });

        if (!existingMessage) {
          const content = isEvening
            ? `🌙 **Evening Frictionless Check-In**: I noticed zero habits are logged for today yet. Don't stress or write off today! James Clear's golden rule is *Never Miss Twice*—protect the identity, not the ego. Can you do a 2-minute downshifted version of just one habit before sleeping? Tap **"Emergency Downscale"** or **"Quick Log My Day"** to lock in your day!`
            : `☀️ **Midday Momentum Check-In**: Your habit slate is currently open for today (${habitsStatus.incompleteCount} pending). Remember Clear's First Law: *Make it Obvious*. What is one 2-minute micro-action you can knock out before lunch to build instant momentum? Tap **"Quick Log My Day"** when you're ready!`;

          await prisma.chatMessage.create({
            data: {
              userId: user.id,
              role: 'assistant',
              content,
              metadata: {
                type: 'proactive_checkin',
                slot: timeSlot,
                date: todayStr,
                incompleteHabits: habitsStatus.incompleteHabits.map((h) => h.title),
              },
            },
          });

          dispatchedCount++;
        }
      }
    }

    return { dispatchedCount, timeSlot, date: todayStr };
  }

  // =========================================================================
  // 4. RETRIEVAL-AUGMENTED GENERATION (RAG) & CONVERSATION PROCESSOR
  // =========================================================================

  /**
   * Main conversational entry point. Accepts conversation messages array from the frontend,
   * performs RAG data retrieval, executes LLM generation via the Anthropic SDK (with tool calling),
   * and persists chat memory across sessions.
   */
  async processConversation(
    userId: string,
    incomingMessages: InputChatMessage[],
    clientDate?: string
  ): Promise<{ response: string; toolsExecuted: ToolExecutionRecord[] }> {
    const todayStr = clientDate || new Date().toISOString().split('T')[0];

    // 1. RAG Retrieval: Fetch user's CoachProfile and today's DailyLog habit statuses
    const [profile, habitsStatus] = await Promise.all([
      this.getOrCreateProfile(userId),
      this.getDailyHabits(userId, todayStr),
    ]);

    // Extract latest user message
    const lastUserMsg = incomingMessages.filter((m) => m.role === 'user').pop();
    const latestUserText = lastUserMsg?.content || 'Hello';

    // 2. Dynamic System Prompt with injected RAG context
    const dynamicSystemPrompt = `${ATOMIC_HABITS_SYSTEM_PROMPT}

CURRENT USER CONTEXT & HABIT DATA (RAG RETRIEVAL):
- User Target Identity: "${profile.targetIdentity}"
- Coaching Style Preference: "${profile.coachingStyle}"
- Behavioral Tags: [${(profile.behavioralTags || []).join(', ')}]
- Today's Date: ${todayStr}
- Daily Habits Overview:
  * Total Habits: ${habitsStatus.totalHabits}
  * Completed Today (${habitsStatus.completedCount}): ${
      habitsStatus.completedHabits.map((h) => `${h.title} (ID: ${h.id}, Goal: ${h.goalDays} days)`).join(', ') ||
      'None yet'
    }
  * Incomplete / Pending Today (${habitsStatus.incompleteCount}): ${
      habitsStatus.incompleteHabits.map((h) => `${h.title} (ID: ${h.id}, Goal: ${h.goalDays} days)`).join(', ') ||
      'All completed today!'
    }

AVAILABLE AUTONOMOUS TOOLS:
1. getDailyHabits(userId): Fetches daily logs for current date.
2. toggleHabitLog(habitId, date, status): Creates or updates a DailyLog row. When the user indicates they completed a habit, invoke this tool.
3. scaleHabitTarget(habitId, newGoal): Dynamically lowers habit goal parameters when user burnout or high friction is detected.

INSTRUCTION: Respond directly, warmly, and authentically to what the user shares first. Validate their emotional state or identity before steering toward sustainable daily systems.`;

    const toolsExecuted: ToolExecutionRecord[] = [];

    // Re-check client initializations if env variables were updated dynamically
    this.initClients();

    // No keyword or canned fallback: if the coach can't answer, the caller is told so.
    if (!this.anthropic) {
      throw new AppError('The coach is unavailable right now. Your habits still work.', 503);
    }

    let result: string;
    try {
      result = await this.executeWithAnthropic(
        userId,
        incomingMessages,
        dynamicSystemPrompt,
        todayStr,
        toolsExecuted
      );
    } catch (err) {
      console.error('[AICoachService]: Anthropic call failed:', err);
      throw new AppError('The coach is unavailable right now. Your habits still work.', 503);
    }

    await prisma.chatMessage.create({
      data: {
        userId,
        role: 'user',
        content: latestUserText,
        metadata: { clientDate: todayStr },
      },
    });
    await this.persistAssistantResponse(userId, result, toolsExecuted);
    return { response: result, toolsExecuted };
  }

  // =========================================================================
  // 5. OFFICIAL ANTHROPIC SDK INTEGRATION (Tool Calling & Multi-Turn)
  // =========================================================================

  private async executeWithAnthropic(
    userId: string,
    messages: InputChatMessage[],
    systemPrompt: string,
    todayStr: string,
    toolsExecuted: ToolExecutionRecord[]
  ): Promise<string> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    const anthropicTools: Anthropic.Tool[] = [
      {
        name: 'getDailyHabits',
        description: 'Fetches daily logs and completed/incomplete habits for the current date from Supabase.',
        input_schema: {
          type: 'object',
          properties: {
            targetDate: { type: 'string', description: 'Date in YYYY-MM-DD format (defaults to current date)' },
          },
        },
      },
      {
        name: 'toggleHabitLog',
        description: 'Creates or updates a DailyLog row completion status for a habit on a specific date.',
        input_schema: {
          type: 'object',
          properties: {
            habitId: { type: 'string', description: 'UUID of the habit' },
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            status: { type: 'boolean', description: 'True if habit is completed, false otherwise' },
          },
          required: ['habitId', 'date', 'status'],
        },
      },
      {
        name: 'scaleHabitTarget',
        description: 'Dynamically lowers habit goal parameters when user burnout or friction is detected.',
        input_schema: {
          type: 'object',
          properties: {
            habitId: { type: 'string', description: 'UUID of the habit' },
            newGoal: { type: 'number', description: 'New lowered goal target (in days)' },
          },
          required: ['habitId', 'newGoal'],
        },
      },
    ];

    // Filter and format messages for Anthropic (alternating user/assistant)
    const formattedMessages: Anthropic.MessageParam[] = [];
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        formattedMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    if (formattedMessages.length === 0) {
      formattedMessages.push({ role: 'user', content: 'Hello' });
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: formattedMessages,
      tools: anthropicTools,
    });

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
      const toolResultsPayload: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const toolName = block.name;
        const input = block.input as any;
        let result: any;

        if (toolName === 'getDailyHabits') {
          result = await this.getDailyHabits(userId, input.targetDate || todayStr);
        } else if (toolName === 'toggleHabitLog') {
          result = await this.toggleHabitLog(userId, input.habitId, input.date || todayStr, input.status);
        } else if (toolName === 'scaleHabitTarget') {
          result = await this.scaleHabitTarget(userId, input.habitId, input.newGoal);
        }

        toolsExecuted.push({
          tool: toolName as any,
          args: input,
          result,
        });

        toolResultsPayload.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      // Second turn with tool execution feedback
      const followUp = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...formattedMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResultsPayload },
        ],
      });

      const textBlock = followUp.content.find((b) => b.type === 'text');
      return textBlock && textBlock.type === 'text' ? textBlock.text : 'Actions synchronized with your dashboard.';
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text : 'I have reflected on your habit rhythm.';
  }

  // =========================================================================
  // 6. PERSISTENCE HELPERS
  // =========================================================================

  private async persistAssistantResponse(
    userId: string,
    content: string,
    toolsExecuted: ToolExecutionRecord[]
  ) {
    return prisma.chatMessage.create({
      data: {
        userId,
        role: 'assistant',
        content,
        metadata: {
          toolsExecuted: toolsExecuted as any,
          timestamp: new Date().toISOString(),
        } as any,
      },
    });
  }
}

export const aiCoachService = new AICoachService();
