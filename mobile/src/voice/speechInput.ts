export interface SpeechInput {
  // False if they said no to the microphone.
  start: (onText: (text: string) => void, onEnd: () => void) => Promise<boolean>;
  stop: () => void;
}
