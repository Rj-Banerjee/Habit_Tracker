import { ApiClient } from './api';
import { ChatMessage, CoachProfile, AIChatResponse, ToolExecutionRecord } from '../types';
import { supabase } from './supabase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

export const aiCoachService = {
  /**
   * Fetch recent chat messages for the current user
   */
  async getChatHistory(limit: number = 50): Promise<ChatMessage[]> {
    return ApiClient.get<ChatMessage[]>(`/ai/chat?limit=${limit}`);
  },

  /**
   * Send a message and await complete response and executed tools
   */
  async sendMessage(message: string, currentDate?: string): Promise<AIChatResponse> {
    return ApiClient.post<AIChatResponse>('/ai/chat', { message, currentDate });
  },

  /**
   * Real-time SSE streaming message sender
   */
  async streamMessage(
    message: string,
    currentDate: string | undefined,
    onDelta: (text: string) => void,
    onComplete: (fullText: string, toolsExecuted: ToolExecutionRecord[]) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      let authHeader = 'Bearer dev-mock-token';
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          authHeader = `Bearer ${data.session.access_token}`;
        }
      } catch {
        // Fallback to dev token
      }

      const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ message, currentDate }),
      });

      if (!response.ok) {
        throw new Error(`Failed to stream chat: HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported by browser or response.');
      }

      const decoder = new TextDecoder();
      let fullText = '';
      let toolsExecuted: ToolExecutionRecord[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const payload = JSON.parse(dataStr);
              if (payload.type === 'delta' && payload.text) {
                fullText += payload.text;
                onDelta(payload.text);
              } else if (payload.type === 'done') {
                if (payload.fullText) fullText = payload.fullText;
                if (payload.toolsExecuted) toolsExecuted = payload.toolsExecuted;
                onComplete(fullText, toolsExecuted);
                return;
              }
            } catch {
              // ignore non-json keepalive comments
            }
          }
        }
      }

      // Final fallback if done event didn't trigger
      if (fullText) {
        onComplete(fullText, toolsExecuted);
      } else {
        throw new Error('No streaming data received from AI Coach');
      }
    } catch (err) {
      onError(err as Error);
    }
  },

  /**
   * Get coach profile
   */
  async getProfile(): Promise<CoachProfile> {
    return ApiClient.get<CoachProfile>('/ai/profile');
  },

  /**
   * Update coach profile
   */
  async updateProfile(data: Partial<CoachProfile>): Promise<CoachProfile> {
    return ApiClient.patch<CoachProfile>('/ai/profile', data);
  },

  /**
   * Clear AI conversation
   */
  async clearChat(): Promise<{ success: boolean }> {
    return ApiClient.delete<{ success: boolean }>('/ai/chat');
  },

  /**
   * Trigger proactive activity check
   */
  async triggerProactiveCheck(slot?: '12pm' | '9pm'): Promise<any> {
    return ApiClient.post('/ai/proactive-check', { slot });
  },
};
