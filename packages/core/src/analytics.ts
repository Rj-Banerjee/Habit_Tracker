// Product analytics, off until the closed beta. Events carry no personal data: no habit
// names, no transcripts, no coach text, no account id. Every property is checked against a
// fixed list here, so a mistake elsewhere can't send something it shouldn't.

const SOURCES = ['tap', 'voice', 'coach', 'widget', 'notification', 'siri'] as const;
const LEVELS = ['full', 'minimum', 'setup'] as const;

type Rule =
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'boolean' };

const oneOf = (values: readonly string[]): Rule => ({ kind: 'enum', values });
const count = (max: number): Rule => ({ kind: 'number', min: 0, max });
const flag: Rule = { kind: 'boolean' };

// PLAN.md: every log with its source, onboarding, coach and voice use, and retention.
export const ANALYTICS_EVENTS = {
  habit_logged: { source: oneOf(SOURCES), level: oneOf(LEVELS), backlog: flag, offline: flag },
  habit_undone: { source: oneOf(SOURCES), offline: flag },
  habit_skipped: { source: oneOf(SOURCES), offline: flag },
  habit_repaired: { source: oneOf(SOURCES), offline: flag },
  onboarding_step: { step: oneOf(['identity', 'habits', 'reminder', 'rules', 'finished']), habits: count(10) },
  coach_message_sent: { from: oneOf(['chat', 'card', 'burned_out', 'miss_review']) },
  coach_reply: { outcome: oneOf(['replied', 'busy', 'out_for_today', 'unavailable', 'refused', 'test_only']) },
  voice_used: {
    input: oneOf(['speech', 'typed']),
    language: oneOf(['en-IN', 'hi-IN']),
    outcome: oneOf(['logged', 'confirm', 'which', 'no_habit', 'off_topic', 'unclear', 'question', 'failed', 'on_phone']),
  },
  focus_started: { minutes: count(240) },
  focus_completed: { minutes: count(240), early: flag },
  focus_stopped: { minutes: count(240), logged_minimum: flag },
  app_opened: { days_since_first_open: count(3650) },
} as const satisfies Record<string, Record<string, Rule>>;

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;

type PropType<R> = R extends { kind: 'enum'; values: readonly (infer V)[] }
  ? V
  : R extends { kind: 'number' }
    ? number
    : boolean;

export type AnalyticsProps<E extends AnalyticsEvent> = {
  [K in keyof (typeof ANALYTICS_EVENTS)[E]]?: PropType<(typeof ANALYTICS_EVENTS)[E][K]>;
};

export type CleanProps = Record<string, string | number | boolean>;

// Keeps only properties on the event's list, with values that fit. Anything else goes.
export function cleanProps(event: string, props: Record<string, unknown>): CleanProps | null {
  const rules = (ANALYTICS_EVENTS as Record<string, Record<string, Rule>>)[event];
  if (!rules) return null;
  const clean: CleanProps = {};
  for (const [key, rule] of Object.entries(rules)) {
    const value = props[key];
    if (rule.kind === 'enum' && typeof value === 'string' && rule.values.includes(value)) clean[key] = value;
    if (rule.kind === 'boolean' && typeof value === 'boolean') clean[key] = value;
    if (rule.kind === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = Math.min(rule.max, Math.max(rule.min, Math.round(value)));
    }
  }
  return clean;
}

export interface AnalyticsSink {
  capture(event: string, props: CleanProps, installId: string): void;
}

export interface Analytics {
  enabled: boolean;
  track<E extends AnalyticsEvent>(event: E, props?: AnalyticsProps<E>): void;
}

// Off unless the env says "on". A failing sink never breaks the app.
export function createAnalytics(options: {
  enabled: boolean;
  sink: AnalyticsSink | null;
  installId: () => string | null;
}): Analytics {
  const enabled = options.enabled && options.sink !== null;
  return {
    enabled,
    track(event, props = {}) {
      if (!enabled) return;
      const id = options.installId();
      const clean = cleanProps(event, props as Record<string, unknown>);
      if (!id || !clean) return;
      try {
        options.sink?.capture(event, clean, id);
      } catch {
        // Analytics is never worth an error on screen.
      }
    },
  };
}

export const analyticsOn = (value: string | undefined) => value?.trim().toLowerCase() === 'on';

export const isBacklog = (date: string | null, today: string) => date !== null && date < today;

// PostHog's capture API, for the closed beta. The project key is a public client key.
export function postHogSink(
  host: string,
  projectKey: string,
  send: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<unknown>
): AnalyticsSink {
  return {
    capture(event, props, installId) {
      void send(`${host.replace(/\/$/, '')}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: projectKey, event, distinct_id: installId, properties: props }),
      }).catch(() => {});
    },
  };
}
