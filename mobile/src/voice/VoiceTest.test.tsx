import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CoachError, SPOKEN_PHRASES } from '@habit-tracker/core';
import { ThemeProvider } from '@habit-tracker/ui';
import { ai } from '../services/ai';
import { speechInput } from './speech';
import { VoiceTest } from './VoiceTest';

jest.mock('../services/ai', () => ({ ai: { voiceSample: jest.fn(() => Promise.resolve()) } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('./speech', () => ({ speechInput: jest.fn() }));

const speech = speechInput as jest.Mock;
const sample = ai.voiceSample as jest.Mock;

// A recogniser that "hears" the given words when the mic is released.
const hearing = (words: string) => {
  let finish: () => void = () => {};
  const input = {
    start: jest.fn(async (_options, onText: (t: string) => void, onEnd: () => void) => {
      finish = () => {
        if (words) onText(words);
        onEnd();
      };
      return true;
    }),
    stop: jest.fn(() => finish()),
  };
  speech.mockReturnValue(input);
  return input;
};

const open = async () => {
  await render(
    <ThemeProvider forced="light">
      <VoiceTest visible onClose={jest.fn()} />
    </ThemeProvider>
  );
  await act(async () => {});
};

const say = async () => {
  await fireEvent(screen.getByLabelText('Hold to talk'), 'pressIn');
  await act(async () => {});
  await fireEvent(screen.getByLabelText('Hold to talk'), 'pressOut');
  await act(async () => {});
};

beforeEach(async () => {
  await AsyncStorage.clear();
  sample.mockClear();
});

describe('VoiceTest', () => {
  it('shows the first phrase, saves what was heard, and moves on', async () => {
    const input = hearing('read fifteen pages');
    await open();
    const [first, second] = SPOKEN_PHRASES;
    expect(screen.getByText(first.say)).toBeTruthy();
    await say();
    expect(input.start.mock.calls[0][0]).toMatchObject({ language: first.language });
    expect(input.start.mock.calls[0][0].hints).toEqual(expect.arrayContaining(['Morning run', 'undo']));
    expect(sample).toHaveBeenCalledWith(first.id, 'read fifteen pages', first.language);
    expect(screen.getByText('Heard: read fifteen pages (saved)')).toBeTruthy();
    expect(screen.getByText(`1 of ${SPOKEN_PHRASES.length} recorded`)).toBeTruthy();
    await fireEvent.press(screen.getByText('Next phrase'));
    expect(screen.getByText(second.say)).toBeTruthy();
  });

  it('picks up where it left off', async () => {
    hearing('x');
    await AsyncStorage.setItem('voice-test-done', JSON.stringify([SPOKEN_PHRASES[0].id, SPOKEN_PHRASES[1].id]));
    await open();
    expect(screen.getByText(SPOKEN_PHRASES[2].say)).toBeTruthy();
    expect(screen.getByText(`2 of ${SPOKEN_PHRASES.length} recorded`)).toBeTruthy();
  });

  it('saves nothing when nothing was heard, and says so', async () => {
    hearing('');
    await open();
    await say();
    expect(sample).not.toHaveBeenCalled();
    expect(screen.getByText("I didn't hear anything. Keep holding while you talk.")).toBeTruthy();
  });

  it('shows the service refusing, and keeps the phrase', async () => {
    hearing('undo that');
    sample.mockRejectedValueOnce(new CoachError('The voice test is only open to test accounts.', 'test_only'));
    await open();
    await say();
    expect(screen.getByText('The voice test is only open to test accounts.')).toBeTruthy();
    expect(screen.getByText(`0 of ${SPOKEN_PHRASES.length} recorded`)).toBeTruthy();
    expect(screen.getByText(SPOKEN_PHRASES[0].say)).toBeTruthy();
  });
});
