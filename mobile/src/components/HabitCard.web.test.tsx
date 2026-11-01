import React, { act } from 'react';
import { Animated } from 'react-native';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../theme/ThemeProvider';
import { identityColors, ThemeName } from '../theme/tokens';
import { HabitCard } from './HabitCard';
import { HabitCardStatus, statusLabels } from './habitCardStatus';
import { StatusMark } from './StatusMark';

// Runs in a real DOM. React only reports invalid DOM props in development and
// through console.error, so any console.error here fails the test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const statuses = Object.keys(statusLabels) as HabitCardStatus[];
const themes: ThemeName[] = ['light', 'dark'];

describe('HabitCard on web', () => {
  let container: HTMLDivElement;
  let errors: jest.SpyInstance;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    errors = jest.spyOn(console, 'error');
  });

  afterEach(() => {
    container.remove();
    jest.restoreAllMocks();
  });

  const draw = async (element: React.ReactElement) => {
    const root = createRoot(container);
    await act(async () => {
      root.render(element);
    });
    return root;
  };

  describe.each(themes)('%s theme', (theme) => {
    it.each(statuses)('draws the %s card with no console errors', async (status) => {
      const root = await draw(
        <ThemeProvider forced={theme}>
          <HabitCard title="Deep work" status={status} identity="identity-1" streak={3} />
        </ThemeProvider>
      );

      expect(container.querySelector('svg')).not.toBeNull();
      expect(container.textContent).toContain(statusLabels[status]);
      expect(errors).not.toHaveBeenCalled();
      await act(async () => root.unmount());
    });
  });

  it('draws every state mark with every identity accent', async () => {
    const tokens = Object.keys(identityColors.light) as Array<keyof (typeof identityColors)['light']>;
    const root = await draw(
      <ThemeProvider forced="light">
        {tokens.flatMap((token) =>
          statuses.map((status) => (
            <StatusMark key={`${token}-${status}`} status={status} identity={token} />
          ))
        )}
      </ThemeProvider>
    );

    expect(container.querySelectorAll('svg')).toHaveLength(tokens.length * statuses.length);
    expect(errors).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('draws a different mark for each state', async () => {
    const markup = new Set<string>();
    for (const status of statuses) {
      const root = await draw(
        <ThemeProvider forced="light">
          <StatusMark status={status} identity="identity-1" />
        </ThemeProvider>
      );
      markup.add(container.innerHTML);
      await act(async () => root.unmount());
    }
    expect(markup.size).toBe(statuses.length);
  });

  it('does not ask for the native driver on web', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const card = (status: HabitCardStatus) => (
      <ThemeProvider forced="light">
        <HabitCard title="Deep work" status={status} identity="identity-1" />
      </ThemeProvider>
    );
    const root = await draw(card('due'));
    await act(async () => root.render(card('done')));
    await act(async () => {
      await Promise.resolve();
    });

    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0][1]).toMatchObject({ useNativeDriver: false });
    await act(async () => root.unmount());
  });
});
