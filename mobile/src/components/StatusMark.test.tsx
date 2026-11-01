import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemeName } from '../theme/tokens';
import { HabitCardStatus, statusLabels } from './habitCardStatus';
import { StatusMark } from './StatusMark';

const statuses = Object.keys(statusLabels) as HabitCardStatus[];
const themes: ThemeName[] = ['light', 'dark'];

describe.each(themes)('StatusMark on native, %s theme', (theme) => {
  it.each(statuses)('draws the %s mark', async (status) => {
    const errors = jest.spyOn(console, 'error');
    const view = await render(
      <ThemeProvider forced={theme}>
        <StatusMark status={status} identity="identity-1" />
      </ThemeProvider>
    );
    expect(view.toJSON()).not.toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
