import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '@habit-tracker/ui';
import { SwipeToSkip } from './SwipeToSkip';

describe('SwipeToSkip', () => {
  it("keeps a skip swipe once it has started, so the pages behind Today can't take it", async () => {
    await render(
      <ThemeProvider forced="light">
        <SwipeToSkip enabled onSkip={jest.fn()}>
          <Text>Read</Text>
        </SwipeToSkip>
      </ThemeProvider>
    );
    expect(screen.getByTestId('swipe-to-skip').props.onResponderTerminationRequest()).toBe(false);
  });
});
