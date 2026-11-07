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
  | (VoiceOption & { intent: 'log_habit' | 'shrink_habit' | 'undo_habit' })
  // unit is what they said it in, if anything; the server converts it or says it can't.
  | (VoiceOption & { intent: 'log_amount'; amount: number; unit?: string | null })
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

// high acts, medium asks first, and low is probably misheard, so they can fix the text.
// no_habit is a clear command for a habit they don't have, and off_topic isn't about
// habits at all.
export type VoiceLevel = 'high' | 'medium' | 'low' | 'no_habit' | 'off_topic';

export interface VoiceParse {
  heard: string;
  corrected: string;
  confidence: number;
  level: VoiceLevel;
  intents: VoiceIntent[];
  missing_habit: string | null;
}

export type ChatEvent = { type: 'text'; text: string } | ({ type: 'actions' } & VoiceParse);

// Where a conversation started. Recorded in coach_events, without the words.
export type ChatSource = 'chat' | 'card' | 'burned_out' | 'miss_review';
export type MissReason = 'tired' | 'forgot' | 'no_time' | 'too_big';

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

    // Settings for a habit the library doesn't know. Checked again by fromAiSuggestion.
    suggestSetup: async (name: string): Promise<Record<string, unknown>> =>
      (await post('/habits/suggest', { name })).json(),

    // The spoken voice test: what the phone heard for one phrase, kept on the AI service.
    voiceSample: async (phraseId: string, heard: string, language: string) => {
      await post('/voice/samples', { phrase_id: phraseId, heard, language });
    },

    // Yields the reply as it arrives, or what the coach decided to do.
    nudgeOutcome: async (habitId: string, date: string, outcome: 'logged' | 'ignored') => {
      await post('/coach/nudge-outcome', { habit_id: habitId, date, outcome });
    },

    chat: (messages: ChatTurn[], source: ChatSource = 'chat', reason?: MissReason) =>
      events(() => post('/coach/chat', { messages, source, reason })),

    letter: (weekStart: string, wins: string[], mood: string | null) =>
      events(() => post('/coach/letter', { week_start: weekStart, wins, mood })),
  };
}

async function* events(open: () => Promise<Response>): AsyncGenerator<ChatEvent> {
  const response = await open();
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
      if (event.type === 'delta') yield { type: 'text', text: event.text };
      if (event.type === 'actions') yield event;
      if (event.type === 'error') {
        throw new CoachError(event.message, event.code, event.retry_after);
      }
      if (event.type === 'done') return;
    }
  }
}

export type AiClient = ReturnType<typeof createAiClient>;
