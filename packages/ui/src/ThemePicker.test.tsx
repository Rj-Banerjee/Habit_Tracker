import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text as PlainText } from 'react-native';
import { STANDARD_THEMES } from '@habit-tracker/core';
import { ThemePicker } from './ThemePicker';
import { ThemeProvider, useTheme } from './ThemeProvider';

function Current() {
  const { theme, identity } = useTheme();
  return <PlainText testID="current">{`${theme.id}|${theme.typography.fonts.regular}|${identity('identity-2').label}`}</PlainText>;
}

const open = async () => {
  const saveChoice = jest.fn();
  await render(
    <ThemeProvider forced="light" storage={{ load: () => null, save: jest.fn(), saveChoice }}>
      <ThemePicker />
      <Current />
    </ThemeProvider>
  );
  await act(async () => {});
  return saveChoice;
};

const current = () => screen.getByTestId('current').props.children;

describe('ThemePicker', () => {
  it('offers every standard theme, with the default picked', async () => {
    await open();
    for (const t of STANDARD_THEMES) expect(screen.getByLabelText(t.name)).toBeTruthy();
    expect(screen.getByLabelText('Warm neutral').props.accessibilityState.selected).toBe(true);
  });

  it('applies a theme and a typeface at once, and remembers them', async () => {
    const saveChoice = await open();
    await fireEvent.press(screen.getByLabelText('Dusk'));
    await fireEvent.press(screen.getByLabelText('Lora'));
    await act(async () => {});
    expect(current()).toBe('dusk|Lora_400Regular|Lagoon');
    expect(saveChoice).toHaveBeenLastCalledWith('{"themeId":"dusk","font":"lora"}');
    await fireEvent.press(screen.getByLabelText("Theme's own"));
    expect(current()).toBe('dusk|Figtree_400Regular|Lagoon');
  });

  it('changes one identity colour, and resets them all', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Change identity colours'));
    await fireEvent.press(screen.getByLabelText('Olive for identity 2'));
    expect(current()).toBe('warm-neutral|Figtree_400Regular|Olive');
    expect(screen.getByText('Identity 2: Olive')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Reset identity colours'));
    expect(current()).toBe('warm-neutral|Figtree_400Regular|Lagoon');
  });
});
