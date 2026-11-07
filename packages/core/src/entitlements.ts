// What each plan includes. The one place that knows this: screens ask for a feature, never
// a plan name, and the AI service checks the same features (backend/app/entitlements.py).
// See "Plans" in PLAN.md. Pricing isn't decided, and the plans may change.

export const PLANS = ['free', 'pro', 'ultra', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const FEATURES = [
  // Free
  'tracker',
  'voice.simple',
  'themes.standard',
  // Pro
  'ai.coach',
  'ai.nudges',
  'ai.voice',
  'ai.setup',
  'ai.insights',
  'themes.game',
  'social',
  // Ultra
  'workspace',
  // Enterprise
  'team',
] as const;
export type Feature = (typeof FEATURES)[number];

const FREE: Feature[] = ['tracker', 'voice.simple', 'themes.standard'];
const PRO: Feature[] = [...FREE, 'ai.coach', 'ai.nudges', 'ai.voice', 'ai.setup', 'ai.insights', 'themes.game', 'social'];
const ULTRA: Feature[] = [...PRO, 'workspace'];
const ENTERPRISE: Feature[] = [...ULTRA, 'team'];

export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  free: FREE,
  pro: PRO,
  ultra: ULTRA,
  enterprise: ENTERPRISE,
};

// The cheapest plan with a feature, for the "Available on Pro" line.
export function planFor(feature: Feature): Plan {
  return PLANS.find((plan) => PLAN_FEATURES[plan].includes(feature)) ?? 'enterprise';
}

const PLAN_NAMES: Record<Plan, string> = { free: 'Free', pro: 'Pro', ultra: 'Ultra', enterprise: 'Enterprise' };

// Unknown or missing plans fall back to Free, so a bad value never unlocks anything.
export const asPlan = (value: unknown): Plan =>
  typeof value === 'string' && (PLANS as readonly string[]).includes(value) ? (value as Plan) : 'free';

export const hasFeature = (plan: Plan, feature: Feature) => PLAN_FEATURES[plan].includes(feature);

// Calm, no upsell: says where it is, nothing more.
export const lockedMessage = (feature: Feature) => `Available on ${PLAN_NAMES[planFor(feature)]}.`;

export const LOCKED_VOICE_HINT =
  'On Free, voice understands simple phrases like "done with Read" or "read 20 pages".';
