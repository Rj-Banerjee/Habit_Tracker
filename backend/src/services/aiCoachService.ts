import { prisma } from '../models/prisma';
import { habitService } from './habit.service';
import { ToolExecutionRecord, AIChatRole } from '../types';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

// Hidden system prompt grounded in James Clear's Atomic Habits
export const ATOMIC_HABITS_SYSTEM_PROMPT = `
You are the autonomous AI Habit Coach for "Habit Tracker Enterprise", a world-class behavioral strategist strictly grounded in James Clear's "Atomic Habits" principles.

CORE IDENTITY & TONE:
- Concise, conversational, empathetic, and relentlessly outcome-oriented.
- Avoid generic corporate pleasantries and empty cheerleading (e.g. "You got this!", "Believe in yourself!"). Focus on systems, cues, and frictionless design.
- Always tie actions back to identity: "Every action you take is a vote for the type of person you wish to become."

THE 4 LAWS OF BEHAVIOR CHANGE:
1. Make it Obvious: Implementation intentions ("I will [BEHAVIOR] at [TIME] in [LOCATION]"), habit stacking ("After [CURRENT HABIT], I will [NEW HABIT]").
2. Make it Attractive: Temptation bundling, reframing habits as opportunities rather than burdens.
3. Make it Easy: 2-Minute Rule (scale habits down so they take less than two minutes to do), reduce friction, prime the environment.
4. Make it Satisfying: Immediate reinforcement, visual habit tracking, "Never miss twice" rule.

CRITICAL RULE - FRICTIONLESS DOWNSHIFTING:
- When the user expresses fatigue, exhaustion, overwhelm, burnout, or failure:
  - NEVER provide generic motivational quotes.
  - EXPLICITLY activate "Frictionless Downshifting".
  - Offer a tiny, frictionless 2-minute version (e.g., replace a 30-minute workout with 10 pushups; replace 1 hour of studying with reading 1 single page; replace a 5-mile run with putting on running shoes).
  - Use the tool 'scaleHabitTarget' to lower their habit goal parameters immediately to protect momentum and streaks.
  - Emphasize: "The goal is not perfection; it's casting a vote for your identity even on your worst day."

TOOLS AT YOUR DISPOSAL:
- getDailyHabits(userId): Fetches incomplete and completed daily logs for current date.
- toggleHabitLog(habitId, date, status): Toggles or marks a habit completed (status: true) or incomplete (status: false).
- scaleHabitTarget(habitId, newGoal): Dynamically lowers habit goal parameters when user burnout or friction is detected.

Always state concisely what actions or tool adjustments were applied to their dashboard.
`;

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

export class AICoachService {
  private openai: OpenAI | null = null;
  private gemini: GoogleGenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }

  // =========================================================================
  // 1. STRICTLY TYPED TOOLS EXPOSED TO THE LLM
  // =========================================================================

  /**
   * Tool 1: getDailyHabits(userId)
   * Fetches incomplete and completed daily logs for the current date from Supabase/Prisma.
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

    // Dedup if user has their own habits
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

  async updateProfile(userId: string, data: { coachingStyle?: string; targetIdentity?: string; behavioralTags?: string[] }) {
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

  async getChatHistory(userId: string, limit: number = 30) {
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
  // 3. BACKGROUND PROACTIVE WORKER (12:00 PM & 9:00 PM)
  // =========================================================================

  /**
   * Checks user activity. If zero habits are logged for today,
   * dispatches a proactive, supportive message payload to the user's AI chat thread.
   */
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
      // Check if habits are logged for today
      const habitsStatus = await this.getDailyHabits(user.id, todayStr);

      if (habitsStatus.completedCount === 0 && habitsStatus.totalHabits > 0) {
        // Check if we already dispatched a check-in for this slot today
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
  // 4. INTELLIGENT AGENT EXECUTION & RAG
  // =========================================================================

  /**
   * Main entry point for chatting with the AI Coach.
   * Leverages RAG to retrieve profile and habit context, executes tools via Function Calling,
   * and persists chat history.
   */
  async processMessage(
    userId: string,
    userMessage: string,
    clientDate?: string
  ): Promise<{ response: string; toolsExecuted: ToolExecutionRecord[] }> {
    const todayStr = clientDate || new Date().toISOString().split('T')[0];

    // 1. RAG Retrieval: Load User CoachProfile & Current Habit Status
    const [profile, habitsStatus, recentHistory] = await Promise.all([
      this.getOrCreateProfile(userId),
      this.getDailyHabits(userId, todayStr),
      this.getChatHistory(userId, 8),
    ]);

    // Save user's incoming message
    await prisma.chatMessage.create({
      data: {
        userId,
        role: 'user',
        content: userMessage,
        metadata: { clientDate: todayStr },
      },
    });

    const toolsExecuted: ToolExecutionRecord[] = [];

    // Check if external LLM API key exists (OpenAI or Gemini)
    if (process.env.OPENAI_API_KEY) {
      try {
        const result = await this.executeWithOpenAI(
          userId,
          userMessage,
          todayStr,
          profile,
          habitsStatus,
          recentHistory,
          toolsExecuted
        );
        await this.persistAssistantResponse(userId, result, toolsExecuted);
        return { response: result, toolsExecuted };
      } catch (err) {
        console.warn('⚠️ [AICoachService]: OpenAI call failed, switching to behavioral engine fallback:', err);
      }
    } else if (process.env.GEMINI_API_KEY) {
      try {
        const result = await this.executeWithGemini(
          userId,
          userMessage,
          todayStr,
          profile,
          habitsStatus,
          recentHistory,
          toolsExecuted
        );
        await this.persistAssistantResponse(userId, result, toolsExecuted);
        return { response: result, toolsExecuted };
      } catch (err) {
        console.warn('⚠️ [AICoachService]: Gemini call failed, switching to behavioral engine fallback:', err);
      }
    }

    // High-performance, Atomic Habits Behavioral Engine Fallback
    const result = await this.executeBehavioralEngine(
      userId,
      userMessage,
      todayStr,
      profile,
      habitsStatus,
      toolsExecuted
    );

    await this.persistAssistantResponse(userId, result, toolsExecuted);
    return { response: result, toolsExecuted };
  }

  // =========================================================================
  // 5. BEHAVIORAL AGENT ENGINE (Atomic Habits & Frictionless Downshifting)
  // =========================================================================

  private async executeBehavioralEngine(
    userId: string,
    userMessage: string,
    todayStr: string,
    profile: any,
    habitsStatus: DailyHabitsStatusResult,
    toolsExecuted: ToolExecutionRecord[]
  ): Promise<string> {
    const lower = userMessage.toLowerCase().trim();

    // 1. ACTION: "Quick Log My Day" or user asking to log/complete habits
    if (
      lower.includes('quick log') ||
      lower.includes('log my day') ||
      lower.includes('log all') ||
      lower.includes('check all') ||
      lower.includes('mark all complete')
    ) {
      if (habitsStatus.incompleteHabits.length === 0) {
        return `🎉 Fantastic momentum! All **${habitsStatus.totalHabits}** of your daily habits for today (${todayStr}) are already completed. James Clear notes: *"You do not rise to the level of your goals. You fall to the level of your systems."* Today your system held firm!`;
      }

      const loggedTitles: string[] = [];
      for (const habit of habitsStatus.incompleteHabits) {
        const res = await this.toggleHabitLog(userId, habit.id, todayStr, true);
        loggedTitles.push(res.habitTitle);
        toolsExecuted.push({
          tool: 'toggleHabitLog',
          args: { habitId: habit.id, date: todayStr, status: true },
          result: res,
        });
      }

      return `✅ **Quick Log Completed!** I've logged **${loggedTitles.length}** habit(s) for today:\n${loggedTitles.map((t) => `• ${t}`).join('\n')}\n\nYour daily progress bar and matrix are now updated. Every completion is a direct vote for your identity as a **${profile.targetIdentity}**!`;
    }

    // 2. CRITICAL RULE: "I'm Feeling Burned Out" / Fatigue / Exhaustion -> FRICTIONLESS DOWNSHIFTING
    if (
      lower.includes('burned out') ||
      lower.includes('burnout') ||
      lower.includes('tired') ||
      lower.includes('exhausted') ||
      lower.includes('failed') ||
      lower.includes('overwhelmed') ||
      lower.includes('cant do this') ||
      lower.includes("can't do this") ||
      lower.includes('no energy')
    ) {
      return `🛑 **Frictionless Downshifting Activated**:
I hear you, and this is where real habit mastery happens. When willpower is depleted, conventional motivation fails. In *Atomic Habits*, James Clear emphasizes the **Law of Least Effort** and the **2-Minute Rule**:

> *"Never miss twice. A bad day completed at 2% is infinitely better than 0%."*

**Here is your downshifted plan for today:**
${habitsStatus.incompleteHabits.length > 0 ? habitsStatus.incompleteHabits.map((h) => `• **${h.title}**: Scale down to a 2-minute micro-action (e.g. 5 pushups, reading 1 paragraph, or 3 deep breaths).`).join('\n') : '• Take 2 deep breaths and claim victory for showing up.'}

Would you like me to trigger an **"Emergency Downscale"** to permanently lower target friction until your energy restores? Click the chip above or reply *"Yes, downscale"*!`;
    }

    // 3. ACTION: "Emergency Downscale" -> Scale Habit Targets Down
    if (
      lower.includes('emergency downscale') ||
      lower.includes('downscale') ||
      lower.includes('lower goal') ||
      lower.includes('reduce target') ||
      lower.includes('yes, downscale')
    ) {
      if (habitsStatus.incompleteHabits.length === 0 && habitsStatus.completedHabits.length === 0) {
        return `You have no active daily habits to downscale. Add a daily habit first!`;
      }

      const allHabits = [...habitsStatus.incompleteHabits, ...habitsStatus.completedHabits];
      const scaledResults: string[] = [];

      for (const h of allHabits) {
        // Downscale goal by 30-50% to ease pressure
        const targetGoal = Math.max(7, Math.floor(h.goalDays * 0.7));
        if (targetGoal < h.goalDays) {
          const res = await this.scaleHabitTarget(userId, h.id, targetGoal);
          toolsExecuted.push({
            tool: 'scaleHabitTarget',
            args: { habitId: h.id, newGoal: targetGoal },
            result: res,
          });
          scaledResults.push(`• **${h.title}**: Goal lowered from ${res.previousGoal} to **${res.newGoal} days**`);
        }
      }

      if (scaledResults.length === 0) {
        return `Your habit targets are already calibrated to the minimal friction floor (7 days). Focus simply on 2-minute check-ins today!`;
      }

      return `📉 **Emergency Downscale Executed**:
I have reduced the goal targets for your habits to relieve cognitive load:
${scaledResults.join('\n')}

Your charts and habit matrix have updated optimistically. Keep the streak alive with zero guilt!`;
    }

    // 4. ACTION: "Review My Week" / Analysis
    if (
      lower.includes('review my week') ||
      lower.includes('review week') ||
      lower.includes('weekly review') ||
      lower.includes('how am i doing') ||
      lower.includes('progress')
    ) {
      const toolRes = await this.getDailyHabits(userId, todayStr);
      toolsExecuted.push({
        tool: 'getDailyHabits',
        args: { userId, targetDate: todayStr },
        result: toolRes,
      });

      const completionRate =
        toolRes.totalHabits > 0
          ? Math.round((toolRes.completedCount / toolRes.totalHabits) * 100)
          : 0;

      return `📊 **Weekly Behavioral Momentum Review**:
• **Today's Status**: ${toolRes.completedCount} / ${toolRes.totalHabits} completed (${completionRate}%)
• **Active Target Identity**: *${profile.targetIdentity}*
• **Coaching Style**: *${profile.coachingStyle}*

**Atomic Strategy for the Days Ahead:**
1. **Habit Stacking**: Attach your hardest habit directly after your morning coffee or primary anchor.
2. **Environment Priming**: Set out your workout clothes or book the night before to eliminate cue friction.
3. Keep showing up—consistency compounds!`;
    }

    // 5. Individual habit toggling request (e.g. "I finished reading", "mark workout as done")
    const allHabits = [...habitsStatus.incompleteHabits, ...habitsStatus.completedHabits];
    const isLogIntent =
      lower.includes('done') ||
      lower.includes('finished') ||
      lower.includes('did') ||
      lower.includes('completed') ||
      lower.includes('log') ||
      lower.includes('check');

    const matchedHabit = allHabits.find((h) => {
      const titleLower = h.title.toLowerCase();
      // Exact substring match
      if (lower.includes(titleLower)) return true;
      // Keyword matching (e.g., "workout", "exercise", "reading", "water", "journal", "stretch")
      const words = titleLower.split(/[\s,()/-]+/).filter((w) => w.length >= 4);
      return words.some((w) => lower.includes(w));
    });

    if (matchedHabit && isLogIntent) {
      const res = await this.toggleHabitLog(userId, matchedHabit.id, todayStr, true);
      toolsExecuted.push({
        tool: 'toggleHabitLog',
        args: { habitId: matchedHabit.id, date: todayStr, status: true },
        result: res,
      });

      return `🎯 Recorded! I've marked **${matchedHabit.title}** as completed for today. That is another vote cast for your identity as a **${profile.targetIdentity}**. What's next on your rhythm?`;
    }

    // Default conversational response grounded in Atomic Habits
    return `Hello! As your behavioral coach, I'm here to ensure your daily systems remain frictionless. 

Today (${todayStr}), you have **${habitsStatus.completedCount}/${habitsStatus.totalHabits}** habits completed. 

How can we optimize your rhythm right now? You can tap **"Quick Log My Day"**, ask to downscale if you're feeling fatigue, or tell me which habit you just finished!`;
  }

  // =========================================================================
  // 6. OPENAI TOOL CALLING INTEGRATION
  // =========================================================================

  private async executeWithOpenAI(
    userId: string,
    userMessage: string,
    todayStr: string,
    profile: any,
    habitsStatus: DailyHabitsStatusResult,
    recentHistory: any[],
    toolsExecuted: ToolExecutionRecord[]
  ): Promise<string> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const tools: OpenAI.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'getDailyHabits',
          description: 'Fetches incomplete and completed daily logs for current date from Supabase/Prisma.',
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

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${ATOMIC_HABITS_SYSTEM_PROMPT}

USER CONTEXT:
- Target Identity: "${profile.targetIdentity}"
- Coaching Style: "${profile.coachingStyle}"
- Behavioral Tags: ${profile.behavioralTags.join(', ')}
- Today's Date: ${todayStr}
- Current Habits Today:
  Completed (${habitsStatus.completedCount}): ${habitsStatus.completedHabits.map((h) => `${h.title} (id: ${h.id}, goal: ${h.goalDays}d)`).join(', ') || 'None'}
  Incomplete (${habitsStatus.incompleteCount}): ${habitsStatus.incompleteHabits.map((h) => `${h.title} (id: ${h.id}, goal: ${h.goalDays}d)`).join(', ') || 'None'}
`,
      },
    ];

    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    messages.push({ role: 'user', content: userMessage });

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const choice = completion.choices[0];
    const message = choice.message;

    // Handle tool calling
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolMessages: OpenAI.ChatCompletionMessageParam[] = [...messages, message];

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

    return message.content || 'I have reviewed your habit systems.';
  }

  // =========================================================================
  // 7. GEMINI TOOL CALLING INTEGRATION
  // =========================================================================

  private async executeWithGemini(
    userId: string,
    userMessage: string,
    todayStr: string,
    profile: any,
    habitsStatus: DailyHabitsStatusResult,
    recentHistory: any[],
    toolsExecuted: ToolExecutionRecord[]
  ): Promise<string> {
    if (!this.gemini) throw new Error('Gemini client not initialized');

    // Define function declarations for Gemini
    const toolDeclarations: any[] = [
      {
        name: 'getDailyHabits',
        description: 'Fetches incomplete and completed daily logs for current date from Supabase/Prisma.',
        parameters: {
          type: 'OBJECT',
          properties: {
            targetDate: { type: 'STRING', description: 'Date in YYYY-MM-DD format (defaults to today)' },
          },
        },
      },
      {
        name: 'toggleHabitLog',
        description: 'Creates or updates a DailyLog row completion status for a habit on a specific date.',
        parameters: {
          type: 'OBJECT',
          properties: {
            habitId: { type: 'STRING', description: 'UUID of the daily habit' },
            date: { type: 'STRING', description: 'Date in YYYY-MM-DD format' },
            status: { type: 'BOOLEAN', description: 'True if habit is completed, false otherwise' },
          },
          required: ['habitId', 'date', 'status'],
        },
      },
      {
        name: 'scaleHabitTarget',
        description: 'Dynamically lowers habit goal parameters when user burnout or friction is detected.',
        parameters: {
          type: 'OBJECT',
          properties: {
            habitId: { type: 'STRING', description: 'UUID of the daily habit' },
            newGoal: { type: 'NUMBER', description: 'New lowered goal target (in days)' },
          },
          required: ['habitId', 'newGoal'],
        },
      },
    ];

    const systemInstruction = `${ATOMIC_HABITS_SYSTEM_PROMPT}

USER CONTEXT:
- Target Identity: "${profile.targetIdentity}"
- Coaching Style: "${profile.coachingStyle}"
- Behavioral Tags: ${profile.behavioralTags.join(', ')}
- Today's Date: ${todayStr}
- Current Habits Today:
  Completed (${habitsStatus.completedCount}): ${habitsStatus.completedHabits.map((h) => `${h.title} (id: ${h.id})`).join(', ') || 'None'}
  Incomplete (${habitsStatus.incompleteCount}): ${habitsStatus.incompleteHabits.map((h) => `${h.title} (id: ${h.id})`).join(', ') || 'None'}
`;

    const contents: any[] = [];
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    const response = await this.gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const fc of functionCalls) {
        let toolResult: any;
        const args: any = fc.args || {};

        if (fc.name === 'getDailyHabits') {
          toolResult = await this.getDailyHabits(userId, args.targetDate || todayStr);
        } else if (fc.name === 'toggleHabitLog') {
          toolResult = await this.toggleHabitLog(userId, args.habitId, args.date || todayStr, args.status);
        } else if (fc.name === 'scaleHabitTarget') {
          toolResult = await this.scaleHabitTarget(userId, args.habitId, args.newGoal);
        }

        toolsExecuted.push({
          tool: fc.name as any,
          args,
          result: toolResult,
        });
      }

      // Return synthesized response with tool updates
      return (
        response.text ||
        `Action applied! I executed ${toolsExecuted.map((t) => t.tool).join(', ')} on your dashboard to protect your rhythm.`
      );
    }

    return response.text || 'I have evaluated your habit rhythm.';
  }

  // =========================================================================
  // 8. HELPERS
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
