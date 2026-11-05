import { describe, expect, it } from 'vitest';
import { asPlan, FEATURES, hasFeature, lockedMessage, PLAN_FEATURES, planFor, PLANS } from './entitlements';

describe('entitlements', () => {
  it('gives Free the whole tracker, simple voice and the normal themes, and no AI', () => {
    expect(hasFeature('free', 'tracker')).toBe(true);
    expect(hasFeature('free', 'voice.simple')).toBe(true);
    expect(hasFeature('free', 'themes.standard')).toBe(true);
    expect(hasFeature('free', 'ai.coach')).toBe(false);
    expect(hasFeature('free', 'ai.voice')).toBe(false);
    expect(hasFeature('free', 'ai.nudges')).toBe(false);
  });

  it('gives Pro the AI layer, game themes and social', () => {
    for (const feature of ['ai.coach', 'ai.nudges', 'ai.voice', 'themes.game', 'social'] as const) {
      expect(hasFeature('pro', feature)).toBe(true);
    }
    expect(hasFeature('pro', 'workspace')).toBe(false);
  });

  it('adds the workspace on Ultra and teams on Enterprise', () => {
    expect(hasFeature('ultra', 'workspace')).toBe(true);
    expect(hasFeature('ultra', 'team')).toBe(false);
    expect(hasFeature('enterprise', 'team')).toBe(true);
  });

  it('includes everything from the plan below, every time', () => {
    for (let i = 1; i < PLANS.length; i += 1) {
      for (const feature of PLAN_FEATURES[PLANS[i - 1]]) {
        expect(PLAN_FEATURES[PLANS[i]]).toContain(feature);
      }
    }
  });

  it('puts every feature on some plan', () => {
    for (const feature of FEATURES) {
      expect(PLANS.some((plan) => hasFeature(plan, feature))).toBe(true);
    }
  });

  it('names the cheapest plan with a feature, calmly', () => {
    expect(planFor('ai.coach')).toBe('pro');
    expect(lockedMessage('ai.coach')).toBe('Available on Pro.');
    expect(lockedMessage('workspace')).toBe('Available on Ultra.');
  });

  it('treats anything unknown as Free, so nothing unlocks by accident', () => {
    expect(asPlan('pro')).toBe('pro');
    expect(asPlan('premium')).toBe('free');
    expect(asPlan(null)).toBe('free');
    expect(asPlan(undefined)).toBe('free');
  });
});
