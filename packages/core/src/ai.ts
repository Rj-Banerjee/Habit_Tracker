// Talks to the AI service. Every call needs the person's session token, and the keys
// stay on the server. When the service is down, the tracker keeps working without it.

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface VoiceOption {
  habit_id: string;
  habit_title: string;
}

export type VoiceAction =
  | (VoiceOption & { intent: 'log_habit' | 'shrink_habit' })
  | (VoiceOption & { intent: 'log_amount'; amount: number })
  | (VoiceOption & { intent: 'skip_habit'; reason: string });

// Two habits could be what they meant, so the app asks once.
export interface VoiceQuestion {
  intent: 'ask_which';
  options: VoiceOption[];
  action: VoiceAction['intent'];
  amount?: number;
  reason?: string;
}

export type VoiceIntent =
  | VoiceAction
  | VoiceQuestion
  | { intent: 'undo_last' }
  | { intent: 'ask_coach'; question: string };

// How sure the parser is. high acts, medium asks first, low shows what it heard so they
// can fix it, and none means it was clear but isn't one of their habits.
export type VoiceLevel = 'high' | 'medium' | 'low' | 'none';

export interface VoiceParse {
  heard: string;
  corrected: string;
  confidence: number;
  level: VoiceLevel;
  intents: VoiceIntent[];
}

// Where a conversation started. Recorded in coach_events, without the words.
export type ChatSource = 'chat' | 'card' | 'burned_out';

export class CoachError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryAfter: number | null = null
  ) {
    super(message);
  }
}

const UNAVAILABLE = "Coach isn't available right now. Your habits still work as normal.";

interface AiClientOptions {
  // Missing means no AI service is set up, which reads the same as one that's down.
  baseUrl?: string;
  getToken: () => Promise<string | null>;
  // React Native's own fetch can't stream, so mobile passes expo/fetch.
  fetch?: typeof fetch;
}

export function createAiClient({ baseUrl, getToken, fetch: send = fetch }: AiClientOptions) {
  const post = async (path: string, body: unknown) => {
    if (!baseUrl) throw new CoachError(UNAVAILABLE, 'unavailable');
    const token = await getToken();
    let response: Response;
    try {
      response = await send(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch {
      throw new CoachError(UNAVAILABLE, 'unavailable');
    }
    if (response.ok) return response;
    const problem = await response.json().catch(() => null);
    throw new CoachError(
      problem?.message ?? UNAVAILABLE,
      problem?.code ?? 'unavailable',
      problem?.retry_after ?? null
    );
  };

  return {
    parseVoice: async (transcript: string): Promise<VoiceParse> =>
      (await post('/voice/parse', { transcript })).json(),

    // Yields the reply as it arrives.
    async *chat(messages: ChatTurn[], source: ChatSource = 'chat'): AsyncGenerator<string> {
      const response = await post('/coach/chat', { messages, source });
      const reader = response.body?.getReader();
      if (!reader) throw new CoachError(UNAVAILABLE, 'unavailable');

      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === 'delta') yield event.text;
          if (event.type === 'error') {
            throw new CoachError(event.message, event.code, event.retry_after);
          }
          if (event.type === 'done') return;
        }
      }
    },
  };
}

export type AiClient = ReturnType<typeof createAiClient>;
