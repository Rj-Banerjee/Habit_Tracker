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

  it('builds the saved theme, typeface and identity colours, and saves a new pick', async () => {
    function Picked() {
      const { theme, text, colors, identity, radii, setChoice } = useTheme();
      return (
        <Pressable onPress={() => setChoice({ themeId: 'paper' })}>
          <PlainText>{`${theme.id}|${text.body.fontFamily}|${colors.canvas}|${identity('identity-1').accent}|${radii.md}`}</PlainText>
        </Pressable>
      );
    }
    const saveChoice = jest.fn();
    await render(
      <ThemeProvider
        storage={{
          load: () => 'light',
          save: jest.fn(),
          loadChoice: async () => '{"themeId":"sage","font":"lora","accents":{"identity-1":"indigo"}}',
          saveChoice,
        }}
      >
        <Picked />
      </ThemeProvider>
    );
    await act(async () => {});
    expect(screen.getByText('sage|Lora_400Regular|#ECF0EB|#3939CD|18')).toBeTruthy();
    await fireEvent.press(screen.getByText(/^sage/));
    await act(async () => {});
    expect(screen.getByText('paper|Figtree_400Regular|#EEF0F1|#1D5C30|10')).toBeTruthy();
    expect(saveChoice).toHaveBeenCalledWith('{"themeId":"paper"}');
  });

  it('starts on the default look with nothing saved', async () => {
    function Look() {
      const { theme } = useTheme();
      return <PlainText>{theme.id}</PlainText>;
    }
    await render(
      <ThemeProvider storage={{ load: () => null, save: jest.fn(), loadChoice: () => 'junk' }}>
        <Look />
      </ThemeProvider>
    );
    await act(async () => {});
    expect(screen.getByText('warm-neutral')).toBeTruthy();
  });
});
