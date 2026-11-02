import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text as PlainText, useColorScheme } from 'react-native';
import { ThemePreference, ThemeProvider, ThemeStorage, useTheme } from './ThemeProvider';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'dark'),
}));

function Probe({ next }: { next: ThemePreference }) {
  const { name, preference, setPreference } = useTheme();
  return (
    <Pressable onPress={() => setPreference(next)}>
      <PlainText>{`${preference}:${name}`}</PlainText>
    </Pressable>
  );
}

const open = async (storage?: ThemeStorage, next: ThemePreference = 'light') => {
  await render(
    <ThemeProvider storage={storage}>
      <Probe next={next} />
    </ThemeProvider>
  );
  await act(async () => {});
};

describe('ThemeProvider', () => {
  it('follows the phone on System', async () => {
    await open();
    expect(screen.getByText('system:dark')).toBeTruthy();
    expect(useColorScheme).toHaveBeenCalled();
  });

  it('applies a choice at once and saves it', async () => {
    const storage = { load: () => null, save: jest.fn() };
    await open(storage);
    await fireEvent.press(screen.getByText('system:dark'));
    await act(async () => {});
    expect(screen.getByText('light:light')).toBeTruthy();
    expect(storage.save).toHaveBeenCalledWith('light');
  });

  it('remembers it after a restart', async () => {
    await open({ load: async () => 'light', save: jest.fn() });
    expect(screen.getByText('light:light')).toBeTruthy();
  });

  it('ignores anything else in storage', async () => {
    await open({ load: () => 'purple', save: jest.fn() });
    expect(screen.getByText('system:dark')).toBeTruthy();
  });

  it('survives storage that fails', async () => {
    const storage = {
      load: async () => {
        throw new Error('blocked');
      },
      save: () => {
        throw new Error('blocked');
      },
    };
    await open(storage);
    await fireEvent.press(screen.getByText('system:dark'));
    await act(async () => {});
    expect(screen.getByText('light:light')).toBeTruthy();
  });
});
