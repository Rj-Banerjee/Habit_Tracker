import { VoiceLanguage } from '@habit-tracker/core';

export interface SpeechOptions {
  language: VoiceLanguage;
  // Command words and habit names, so the recogniser favours them.
  hints: string[];
}

export interface SpeechInput {
  // False if they said no to the microphone.
  start: (
    options: SpeechOptions,
    onText: (text: string) => void,
    onEnd: () => void
  ) => Promise<boolean>;
  stop: () => void;
}
