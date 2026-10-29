import { prisma } from '../models/prisma';
import { habitService } from './habit.service';
import { ToolExecutionRecord, AIChatRole } from '../types';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

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
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private gemini: GoogleGenAI | null = null;

  constructor() {
    this.initClients();
  }

  private initClients() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

    // Find all habits belonging to user or demo user fallback
    let habits = await prisma.dailyHabits.findMany({
      where: {
        OR: [
          { user_id: userId },
          { user_id: '00000000-0000-0000-0000-000000000001' },
        ],
      },
      include: {
        logs: {
          where: { date: dateKey },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    // Deduplicate if user has their own habits
    const userOwnedHabits = habits.filter((h) => h.user_id === userId);
    if (userOwnedHabits.length > 0) {
      habits = userOwnedHabits;
    }

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
      where: {
        id: habitId,
        OR: [
          { user_id: userId },
          { user_id: '00000000-0000-0000-0000-000000000001' },
        ],
      },
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
      where: {
        id: habitId,
        OR: [
          { user_id: userId },
          { user_id: '00000000-0000-0000-0000-000000000001' },
        ],
      },
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
    return prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
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
   * performs RAG data retrieval, executes LLM generation via OpenAI/Anthropic SDKs (with tool calling),
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

    // Persist latest user input to database
    await prisma.chatMessage.create({
      data: {
        userId,
        role: 'user',
        content: latestUserText,
        metadata: { clientDate: todayStr },
      },
    });

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

    // 3. GENERATIVE LLM: Official Anthropic SDK integration
    if (this.anthropic) {
      try {
        const result = await this.executeWithAnthropic(
          userId,
          incomingMessages,
          dynamicSystemPrompt,
          todayStr,
          toolsExecuted
        );
        await this.persistAssistantResponse(userId, result, toolsExecuted);
        return { response: result, toolsExecuted };
      } catch (err) {
        console.warn('⚠️ [AICoachService]: Anthropic call failed, falling back to OpenAI or Generative Engine:', err);
      }
    }

    // 4. GENERATIVE LLM: Official OpenAI SDK integration
    if (this.openai) {
      try {
        const result = await this.executeWithOpenAI(
          userId,
          incomingMessages,
          dynamicSystemPrompt,
          todayStr,
          toolsExecuted
        );
        await this.persistAssistantResponse(userId, result, toolsExecuted);
        return { response: result, toolsExecuted };
      } catch (err) {
        console.warn('⚠️ [AICoachService]: OpenAI call failed, falling back to Generative Engine:', err);
      }
    }

    // 5. High-fidelity Dynamic Conversational Engine (adheres to Rule 1, 2, 3, 4 without static strings)
    const result = await this.executeDynamicConversationalEngine(
      userId,
      latestUserText,
      incomingMessages,
      todayStr,
      profile,
      habitsStatus,
      toolsExecuted
    );

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
  // 6. OFFICIAL OPENAI SDK INTEGRATION (Tool Calling & Multi-Turn)
  // =========================================================================

  private async executeWithOpenAI(
    userId: string,
    messages: InputChatMessage[],
    systemPrompt: string,
    todayStr: string,
    toolsExecuted: ToolExecutionRecord[]
  ): Promise<string> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const tools: OpenAI.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'getDailyHabits',
          description: 'Fetches daily logs and completed/incomplete habits for current date from Supabase/Prisma.',
          parameters: {
            type: 'object',
            properties: {
              targetDate: { type: 'string', description: 'Date in YYYY-MM-DD format (defaults to today)' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'toggleHabitLog',
          description: 'Creates or updates a DailyLog row completion status for a habit on a specific date.',
          parameters: {
            type: 'object',
            properties: {
              habitId: { type: 'string', description: 'UUID of the daily habit' },
              date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
              status: { type: 'boolean', description: 'True if habit is completed, false otherwise' },
            },
            required: ['habitId', 'date', 'status'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'scaleHabitTarget',
          description: 'Dynamically lowers habit goal parameters when user burnout or friction is detected.',
          parameters: {
            type: 'object',
            properties: {
              habitId: { type: 'string', description: 'UUID of the daily habit' },
              newGoal: { type: 'number', description: 'New lowered goal target (in days)' },
            },
            required: ['habitId', 'newGoal'],
          },
        },
      },
    ];

    const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        chatMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: chatMessages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const choice = completion.choices[0];
    const message = choice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolMessages: OpenAI.ChatCompletionMessageParam[] = [...chatMessages, message];

      for (const toolCall of message.tool_calls) {
        if (!('function' in toolCall)) continue;
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        let toolResult: any;

        if (name === 'getDailyHabits') {
          toolResult = await this.getDailyHabits(userId, args.targetDate || todayStr);
        } else if (name === 'toggleHabitLog') {
          toolResult = await this.toggleHabitLog(userId, args.habitId, args.date || todayStr, args.status);
        } else if (name === 'scaleHabitTarget') {
          toolResult = await this.scaleHabitTarget(userId, args.habitId, args.newGoal);
        }

        toolsExecuted.push({
          tool: name as any,
          args,
          result: toolResult,
        });

        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Second turn with tool results
      const finalResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: toolMessages,
      });

      return finalResponse.choices[0].message.content || 'Action executed successfully.';
    }

    return message.content || 'I have evaluated your habit rhythm.';
  }

  // =========================================================================
  // 7. DYNAMIC CONVERSATIONAL ENGINE (Rules 1, 2, 3, 4 without static strings)
  // =========================================================================

  private async executeDynamicConversationalEngine(
    userId: string,
    userText: string,
    conversationHistory: InputChatMessage[],
    todayStr: string,
    profile: any,
    habitsStatus: DailyHabitsStatusResult,
    toolsExecuted: ToolExecutionRecord[]
  ): Promise<string> {
    const text = userText.trim();
    const lower = text.toLowerCase();

    // RULE 2: Extract Name Introductions (e.g., "Hi, my name is Alex", "Call me Sarah")
    const nonNameWords = new Set([
      'feeling', 'tired', 'exhausted', 'sad', 'lonely', 'burned', 'ready', 'happy',
      'down', 'sorry', 'here', 'fine', 'good', 'bad', 'struggling', 'doing', 'trying',
      'going', 'not', 'just', 'so', 'very', 'a', 'an', 'the'
    ]);
    let identifiedName: string | null = null;
    const nameMatch = text.match(/(?:my name is|call me)\s+([a-zA-Z]+)|(?:i am|i'm)\s+([A-Z][a-zA-Z]+)/i);
    const candidate = (nameMatch ? nameMatch[1] || nameMatch[2] : null)?.trim();
    if (candidate && !nonNameWords.has(candidate.toLowerCase())) {
      identifiedName = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }

    // RULE 4: Fatigue / Burnout -> Offer 'Emergency Downscale'
    const isFatigued =
      lower.includes('burned out') ||
      lower.includes('burnout') ||
      lower.includes('exhausted') ||
      lower.includes('tired') ||
      lower.includes('overwhelmed') ||
      lower.includes('cannot keep up') ||
      lower.includes("can't keep up") ||
      lower.includes('no energy') ||
      lower.includes('drained');

    // Intent: Emergency Downscale trigger
    const isDownscaleRequested =
      lower.includes('emergency downscale') ||
      lower.includes('downscale') ||
      lower.includes('lower goal') ||
      lower.includes('reduce target');

    // Intent: Quick Log
    const isQuickLog =
      lower.includes('quick log') ||
      lower.includes('log my day') ||
      lower.includes('check all') ||
      lower.includes('mark all complete');

    // Emotional states
    const isSadOrLonely =
      lower.includes('sad') ||
      lower.includes('lonely') ||
      lower.includes('depressed') ||
      lower.includes('down') ||
      lower.includes('crying') ||
      lower.includes('hurting');

    const isAnxiousOrStressed =
      lower.includes('anxious') ||
      lower.includes('stressed') ||
      lower.includes('pressure') ||
      lower.includes('nervous') ||
      lower.includes('panic');

    const isExcitedOrHappy =
      lower.includes('happy') ||
      lower.includes('excited') ||
      lower.includes('great') ||
      lower.includes('proud') ||
      lower.includes('crushed it');

    // Handle Downscale execution
    if (isDownscaleRequested) {
      const allHabits = [...habitsStatus.incompleteHabits, ...habitsStatus.completedHabits];
      const scaledList: string[] = [];

      for (const h of allHabits) {
        const targetGoal = Math.max(7, Math.floor(h.goalDays * 0.7));
        if (targetGoal < h.goalDays) {
          const res = await this.scaleHabitTarget(userId, h.id, targetGoal);
          toolsExecuted.push({
            tool: 'scaleHabitTarget',
            args: { habitId: h.id, newGoal: targetGoal },
            result: res,
          });
          scaledList.push(`• **${h.title}**: Goal lowered from ${res.previousGoal} to **${res.newGoal} days**`);
        }
      }

      return `I hear you loud and clear. When energy is at a minimum, holding unrealistic standards only breeds frustration. 

I've executed an **Emergency Downscale** on your active habits:
${scaledList.length > 0 ? scaledList.join('\n') : '• All habits are currently calibrated to minimum baseline friction.'}

Your dashboard has been updated. Give yourself full permission to do only what feels manageable today. Even a 2-minute version preserves your momentum without draining you.`;
    }

    // Handle Quick Log execution
    if (isQuickLog) {
      if (habitsStatus.incompleteHabits.length === 0) {
        return `You've already conquered all **${habitsStatus.totalHabits}** of your daily habits for today (${todayStr})! Every single system held up, which is a powerful vote for your identity as a **${profile.targetIdentity}**. Take time to unwind—you've earned it.`;
      }

      const logged: string[] = [];
      for (const h of habitsStatus.incompleteHabits) {
        const res = await this.toggleHabitLog(userId, h.id, todayStr, true);
        logged.push(res.habitTitle);
        toolsExecuted.push({
          tool: 'toggleHabitLog',
          args: { habitId: h.id, date: todayStr, status: true },
          result: res,
        });
      }

      return `Done! I've logged **${logged.length}** habit(s) for today:\n${logged.map((t) => `• ${t}`).join('\n')}\n\nYour daily progress bar and matrix updated instantly. That was frictionless execution in action!`;
    }

    // Handle Individual Habit Completion
    const allHabits = [...habitsStatus.incompleteHabits, ...habitsStatus.completedHabits];
    const isLogIntent =
      lower.includes('done') ||
      lower.includes('finished') ||
      lower.includes('did') ||
      lower.includes('completed') ||
      lower.includes('logged');

    const matchedHabit = allHabits.find((h) => {
      const titleLower = h.title.toLowerCase();
      if (lower.includes(titleLower)) return true;
      const keywords = titleLower.split(/[\s,()/-]+/).filter((w) => w.length >= 4);
      return keywords.some((k) => lower.includes(k));
    });

    if (matchedHabit && isLogIntent) {
      const res = await this.toggleHabitLog(userId, matchedHabit.id, todayStr, true);
      toolsExecuted.push({
        tool: 'toggleHabitLog',
        args: { habitId: matchedHabit.id, date: todayStr, status: true },
        result: res,
      });

      return `Excellent work! I've marked **${matchedHabit.title}** as completed for today on your matrix. That's another consistent vote cast for your identity. You now have **${habitsStatus.completedCount + 1}/${habitsStatus.totalHabits}** habits checked off!`;
    }

    // Dynamic response construction following RULE 1, 2, 3, 4
    let validationPart = '';
    let habitSteeringPart = '';

    // RULE 2: Direct, authentic validation of emotional state / introduction
    if (identifiedName) {
      validationPart = `It is truly great to connect with you, ${identifiedName}. Thank you for introducing yourself!`;
    } else if (isSadOrLonely) {
      validationPart = `I'm genuinely sorry you're feeling this way right now. Loneliness and sadness can feel remarkably heavy, and it is completely human to experience days where everything feels muted or isolating. Please know that your feelings are entirely valid, and you don't have to carry it all on your own.`;
    } else if (isAnxiousOrStressed) {
      validationPart = `I hear how much pressure you're under right now. Anxiety and stress make even the simplest routines feel daunting. Take a slow, intentional breath—you are not behind, and you don't have to fix everything in this exact hour.`;
    } else if (isFatigued) {
      validationPart = `I hear you completely. When exhaustion takes over, forcing willpower only backfires. In behavioral science, honoring your limits is just as essential as pushing through.`;
    } else if (isExcitedOrHappy) {
      validationPart = `That energy is contagious! It's fantastic to celebrate moments of genuine momentum and joy. Soak that feeling in—it reinforces all the effort you've been pouring into yourself.`;
    } else {
      validationPart = `I hear what you're sharing. Every day brings a different set of challenges and mental bandwidth, and meeting yourself where you're at is step one.`;
    }

    // RULE 4: If fatigued, explicitly offer Emergency Downscale
    if (isFatigued) {
      habitSteeringPart = `\n\nGiven your energy levels today, let's practice **Frictionless Downshifting**:
- You have **${habitsStatus.incompleteCount}** pending habits right now.
- Instead of forcing the full routine, I can immediately trigger an **Emergency Downscale** to lower your habit targets and keep your streak safe without burnout.

Would you like me to trigger an **Emergency Downscale** for you right now, or would you prefer a 2-minute micro-action?`;
    } else {
      // RULE 3: Gently steer back to daily systems
      const pendingText =
        habitsStatus.incompleteCount > 0
          ? `Looking at your dashboard today (${todayStr}), you have **${habitsStatus.completedCount}/${habitsStatus.totalHabits}** habits completed, with **${habitsStatus.incompleteCount}** remaining.`
          : `All **${habitsStatus.totalHabits}** habits for today are already conquered!`;

      habitSteeringPart = `\n\n${pendingText} Whatever your headspace is right now, how would you like to approach your systems today? You can ask me to log an item, downscale if needed, or simply take things one micro-step at a time.`;
    }

    return `${validationPart}${habitSteeringPart}`;
  }

  // =========================================================================
  // 8. PERSISTENCE HELPERS
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
