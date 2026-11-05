import { describe, expect, it, vi } from 'vitest';
import { analyticsOn, ANALYTICS_EVENTS, cleanProps, createAnalytics, isBacklog, postHogSink } from './analytics';

const sink = () => ({ capture: vi.fn() });

describe('analytics', () => {
  it('is off by default, and only "on" turns it on', () => {
    expect(analyticsOn(undefined)).toBe(false);
    expect(analyticsOn('')).toBe(false);
    expect(analyticsOn('true')).toBe(false);
    expect(analyticsOn(' ON ')).toBe(true);
  });

  it('sends nothing while off', () => {
    const s = sink();
    createAnalytics({ enabled: false, sink: s, installId: () => 'i1' }).track('app_opened', { days_since_first_open: 1 });
    expect(s.capture).not.toHaveBeenCalled();
  });

  it('sends every log with its source, under a random install id', () => {
    const s = sink();
    createAnalytics({ enabled: true, sink: s, installId: () => 'install-1' }).track('habit_logged', {
      source: 'widget',
      level: 'minimum',
      backlog: false,
      offline: true,
    });
    expect(s.capture).toHaveBeenCalledWith(
      'habit_logged',
      { source: 'widget', level: 'minimum', backlog: false, offline: true },
      'install-1'
    );
  });

  it('never lets personal data through, even if it is passed by mistake', () => {
    const leaky = {
      source: 'voice',
      level: 'full',
      title: 'Therapy',
      transcript: 'I went to therapy',
      user_id: 'u1',
      email: 'a@b.c',
    };
    expect(cleanProps('habit_logged', leaky)).toEqual({ source: 'voice', level: 'full' });
  });

  it('drops values that are not on the list', () => {
    expect(cleanProps('voice_used', { input: 'speech', language: 'fr-FR', outcome: 'I read 10 pages' })).toEqual({
      input: 'speech',
    });
  });

  it('keeps numbers whole and in range', () => {
    expect(cleanProps('focus_started', { minutes: 9999.6 })).toEqual({ minutes: 240 });
    expect(cleanProps('focus_started', { minutes: Number.NaN })).toEqual({});
  });

  it('ignores events that are not in the catalogue', () => {
    const s = sink();
    const a = createAnalytics({ enabled: true, sink: s, installId: () => 'i1' });
    (a.track as (event: string, props: object) => void)('coach_text', { text: 'secret' });
    expect(s.capture).not.toHaveBeenCalled();
  });

  it('has no free-text properties anywhere in the catalogue', () => {
    for (const rules of Object.values(ANALYTICS_EVENTS)) {
      for (const rule of Object.values(rules)) {
        expect(['enum', 'number', 'boolean']).toContain(rule.kind);
      }
    }
  });

  it('waits for an install id, and survives a failing sink', () => {
    const s = { capture: vi.fn(() => { throw new Error('down'); }) };
    expect(() =>
      createAnalytics({ enabled: true, sink: s, installId: () => 'i1' }).track('app_opened', { days_since_first_open: 0 })
    ).not.toThrow();
    const quiet = sink();
    createAnalytics({ enabled: true, sink: quiet, installId: () => null }).track('app_opened', {});
    expect(quiet.capture).not.toHaveBeenCalled();
  });

  it('stays off without a sink', () => {
    expect(createAnalytics({ enabled: true, sink: null, installId: () => 'i1' }).enabled).toBe(false);
  });

  it('knows a back-log from a log for today', () => {
    expect(isBacklog('2026-11-04', '2026-11-05')).toBe(true);
    expect(isBacklog('2026-11-05', '2026-11-05')).toBe(false);
    expect(isBacklog(null, '2026-11-05')).toBe(false);
  });

  it('sends to PostHog with only the install id and the clean properties', async () => {
    const send = vi.fn(() => Promise.resolve());
    postHogSink('https://eu.i.posthog.com/', 'phc_public', send).capture('habit_logged', { source: 'tap' }, 'install-1');
    const [url, init] = send.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://eu.i.posthog.com/capture/');
    expect(JSON.parse(init.body)).toEqual({
      api_key: 'phc_public',
      event: 'habit_logged',
      distinct_id: 'install-1',
      properties: { source: 'tap' },
    });
  });
});
