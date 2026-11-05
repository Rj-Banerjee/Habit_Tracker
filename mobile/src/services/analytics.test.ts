describe('analytics on the phone', () => {
  const env = process.env;
  afterEach(() => {
    process.env = env;
    jest.resetModules();
  });

  it('is off unless the beta switches it on, and then sends nothing', async () => {
    process.env = { ...env, EXPO_PUBLIC_ANALYTICS: undefined, EXPO_PUBLIC_POSTHOG_KEY: 'phc_x' };
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({} as Response);
    const { analytics, trackAppOpened } = require('./analytics');
    expect(analytics.enabled).toBe(false);
    analytics.track('habit_logged', { source: 'tap', level: 'full' });
    await trackAppOpened();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('stays off when switched on without a PostHog key', () => {
    process.env = { ...env, EXPO_PUBLIC_ANALYTICS: 'on', EXPO_PUBLIC_POSTHOG_KEY: '' };
    const { analytics } = require('./analytics');
    expect(analytics.enabled).toBe(false);
  });

  it('when on, counts opens under a random install id and days since the first open', async () => {
    process.env = { ...env, EXPO_PUBLIC_ANALYTICS: 'on', EXPO_PUBLIC_POSTHOG_KEY: 'phc_x' };
    jest.doMock('@react-native-async-storage/async-storage', () =>
      require('@react-native-async-storage/async-storage/jest/async-storage-mock')
    );
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({} as Response);
    const { trackAppOpened } = require('./analytics');
    await trackAppOpened(new Date('2026-11-05T09:00:00Z'));
    await trackAppOpened(new Date('2026-11-12T09:00:00Z'));
    const bodies = fetchSpy.mock.calls.map(([, init]: [unknown, RequestInit?]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies.map((b) => b.properties.days_since_first_open)).toEqual([0, 7]);
    expect(bodies[0].distinct_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[0].distinct_id).toBe(bodies[1].distinct_id);
    fetchSpy.mockRestore();
  });
});
