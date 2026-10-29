'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Send,
  Trash2,
  Zap,
  Flame,
  CheckCircle2,
  TrendingDown,
  BarChart2,
  BatteryCharging,
  Bot,
  User,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { aiCoachService } from '../../services/aiCoachService';
import { ChatMessage, ToolExecutionRecord } from '../../types';
import { useToast } from '../../hooks/useToast';

interface AICoachDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  todayDateKey: string;
  onHabitLogUpdated: (habitId: string, date: string, status: boolean) => void;
  onHabitTargetScaled: (habitId: string, newGoal: number) => void;
  onRefreshAnalytics: () => void;
}

const ACTION_CHIPS = [
  {
    label: 'Quick Log My Day',
    icon: CheckCircle2,
    prompt: 'Quick Log My Day',
    color: 'from-emerald-500/10 to-teal-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
  },
  {
    label: "I'm Feeling Burned Out",
    icon: BatteryCharging,
    prompt: "I'm feeling burned out and exhausted today. I can't keep up with everything.",
    color: 'from-amber-500/10 to-orange-500/10 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-50 dark:hover:bg-amber-950/40',
  },
  {
    label: 'Review My Week',
    icon: BarChart2,
    prompt: 'Review my week and analyze my behavioral momentum.',
    color: 'from-blue-500/10 to-indigo-500/10 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/40',
  },
  {
    label: 'Emergency Downscale',
    icon: TrendingDown,
    prompt: 'Emergency Downscale: lower my habit goals to protect my streak from burnout.',
    color: 'from-rose-500/10 to-pink-500/10 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-950/40',
  },
];

export const AICoachDrawer: React.FC<AICoachDrawerProps> = ({
  isOpen,
  onClose,
  todayDateKey,
  onHabitLogUpdated,
  onHabitTargetScaled,
  onRefreshAnalytics,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [coachingStyle, setCoachingStyle] = useState('EMPATHETIC_FIRM');
  const [targetIdentity, setTargetIdentity] = useState('Disciplined Builder');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { success, error: showError } = useToast();

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  // Load chat history & coach profile when drawer is opened
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        const [history, profile] = await Promise.all([
          aiCoachService.getChatHistory(),
          aiCoachService.getProfile().catch(() => null),
        ]);

        if (profile) {
          if (profile.coachingStyle) setCoachingStyle(profile.coachingStyle);
          if (profile.targetIdentity) setTargetIdentity(profile.targetIdentity);
        }

        if (history && history.length > 0) {
          setMessages(history);
        } else {
          // Default welcoming seed message grounded in Atomic Habits
          setMessages([
            {
              id: 'welcome-seed',
              userId: 'system',
              role: 'assistant',
              content: `👋 **Welcome to your AI Habit Coach!** Grounded in James Clear's *Atomic Habits*, I'm here to ensure your daily systems remain completely frictionless.\n\n> *"You do not rise to the level of your goals. You fall to the level of your systems."*\n\nTap an action chip below or ask for frictionless downshifting whenever energy is low!`,
              metadata: { type: 'welcome' },
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };

    loadData();
  }, [isOpen]);

  // Focus textarea when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Process Tool Executions for Real-Time State Syncing
  const handleToolExecutions = (toolsExecuted: ToolExecutionRecord[]) => {
    if (!toolsExecuted || toolsExecuted.length === 0) return;

    let hasLogUpdate = false;
    let hasTargetUpdate = false;

    toolsExecuted.forEach((rec) => {
      if (rec.tool === 'toggleHabitLog') {
        const { habitId, date, status } = rec.args;
        onHabitLogUpdated(habitId, date, status);
        hasLogUpdate = true;
      } else if (rec.tool === 'scaleHabitTarget') {
        const { habitId, newGoal } = rec.args;
        onHabitTargetScaled(habitId, newGoal);
        hasTargetUpdate = true;
      }
    });

    if (hasLogUpdate || hasTargetUpdate) {
      onRefreshAnalytics();
      success(
        hasTargetUpdate
          ? '🎯 Habit target downscaled on your dashboard!'
          : '⚡ Habit log synchronized on your matrix!'
      );
    }
  };

  // Send message using real-time streaming
  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = (customMessage || inputValue).trim();
    if (!textToSend || isLoading) return;

    const tempUserMsg: ChatMessage = {
      id: `client-${Date.now()}`,
      userId: 'current-user',
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setInputValue('');
    setIsLoading(true);
    setStreamingText('');

    try {
      await aiCoachService.streamMessage(
        textToSend,
        todayDateKey,
        (delta) => {
          setStreamingText((prev) => (prev ? prev + delta : delta));
        },
        (fullText, toolsExecuted) => {
          const finalAssistantMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            userId: 'assistant',
            role: 'assistant',
            content: fullText,
            metadata: { toolsExecuted },
            createdAt: new Date().toISOString(),
          };

          setMessages((prev) => [...prev, finalAssistantMsg]);
          setStreamingText(null);
          setIsLoading(false);

          // Trigger state syncing immediately
          if (toolsExecuted && toolsExecuted.length > 0) {
            handleToolExecutions(toolsExecuted);
          }
        },
        (streamErr) => {
          console.warn('Streaming encountered an issue, falling back to standard JSON call:', streamErr);
          // Fallback to standard request
          aiCoachService
            .sendMessage(textToSend, todayDateKey)
            .then((res) => {
              const assistantMsg: ChatMessage = {
                id: `assistant-${Date.now()}`,
                userId: 'assistant',
                role: 'assistant',
                content: res.response,
                metadata: { toolsExecuted: res.toolsExecuted },
                createdAt: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, assistantMsg]);
              setStreamingText(null);
              setIsLoading(false);
              if (res.toolsExecuted) handleToolExecutions(res.toolsExecuted);
            })
            .catch((err) => {
              setStreamingText(null);
              setIsLoading(false);
              showError(`AI Coach error: ${(err as Error).message}`);
            });
        }
      );
    } catch (err) {
      setStreamingText(null);
      setIsLoading(false);
      showError(`Error connecting to AI Coach: ${(err as Error).message}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your AI Coach conversation?')) return;
    try {
      await aiCoachService.clearChat();
      setMessages([
        {
          id: 'welcome-reset',
          userId: 'system',
          role: 'assistant',
          content: 'Conversation cleared. Ready for your next micro-action!',
          createdAt: new Date().toISOString(),
        },
      ]);
      success('Chat history cleared');
    } catch {
      showError('Failed to clear chat history');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Darkened Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-950/40 dark:bg-black/60 backdrop-blur-xs transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Panel from Right */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <aside
          className="w-screen max-w-md sm:max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl border-l border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between overflow-hidden rounded-l-3xl animate-slideInRight"
          role="dialog"
          aria-label="AI Habit Coach Conversational Panel"
        >
          {/* 1. Header (Glassmorphic & Breathable) */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/70 bg-white/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-3">
              {/* Glowing Coach Avatar */}
              <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
                  <Bot className="w-5 h-5" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-white tracking-tight">
                    AI Habit Coach
                  </h2>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                    {coachingStyle.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <span>Target:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                    {targetIdentity}
                  </span>
                </p>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleClearHistory}
                title="Clear Chat History"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                aria-label="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 2. Chat Bubbles List (Scrollable Area) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar">
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isProactive = msg.metadata?.type === 'proactive_checkin';
              const tools = (msg.metadata?.toolsExecuted as ToolExecutionRecord[]) || [];

              return (
                <div
                  key={msg.id || index}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} transition-all`}
                >
                  {/* Proactive Banner if sent by 12PM/9PM Cron Worker */}
                  {isProactive && (
                    <div className="flex items-center gap-1.5 mb-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      <Flame className="w-3 h-3" />
                      <span>Proactive Check-In ({msg.metadata?.slot?.toUpperCase() || 'AUTOMATED'})</span>
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm transition-all ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-xs'
                        : 'bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700/60 rounded-bl-xs shadow-slate-200/50 dark:shadow-none'
                    }`}
                  >
                    {/* Message Content formatted with clean paragraph breaks */}
                    <div className="space-y-2 whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>

                    {/* Tool Execution Badges (State Syncing confirmation) */}
                    {tools.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-1.5">
                        {tools.map((t, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 text-xs font-medium"
                          >
                            <Zap className="w-3.5 h-3.5 text-emerald-500" />
                            <span>
                              {t.tool === 'toggleHabitLog'
                                ? `Synced habit log for ${t.args.date}`
                                : t.tool === 'scaleHabitTarget'
                                ? `Goal downscaled to ${t.args.newGoal} days`
                                : `Evaluated habit matrix`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400 mt-1 px-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}

            {/* Real-time Streaming Response Bubble */}
            {streamingText !== null && (
              <div className="flex flex-col items-start animate-fadeIn">
                <div className="max-w-[85%] rounded-2xl rounded-bl-xs p-4 text-sm bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700/60 shadow-sm leading-relaxed whitespace-pre-wrap">
                  {streamingText}
                  <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse align-middle" />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">Generating response...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 3. Action Chips Row */}
          <div className="px-4 py-2 bg-slate-50/70 dark:bg-slate-900/70 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {ACTION_CHIPS.map((chip, idx) => {
                const Icon = chip.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(chip.prompt)}
                    disabled={isLoading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shadow-xs transition-all shrink-0 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none bg-white dark:bg-slate-800 ${chip.color}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{chip.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Chat Input Bar (Glassmorphic) */}
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-end gap-2 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your coach or type an update..."
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent border-0 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-0 resize-none max-h-28 min-h-[36px] py-1.5 px-2 outline-none"
              />

              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || isLoading}
                aria-label="Send message"
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>Press Enter to send, Shift+Enter for newline</span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-500" />
                Atomic Habits RAG
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
