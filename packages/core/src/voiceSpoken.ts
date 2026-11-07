import spoken from './voiceSpoken.json';
import type { VoiceLanguage } from './voice';

// Phrases to say aloud for the spoken voice test. The backend scores what the phone heard
// for each against the made-up habits in backend/tests/voice_phrases.json.
export interface SpokenPhrase {
  id: string;
  group: string;
  say: string;
  language: VoiceLanguage;
  expect: string[];
  level?: string;
  // For the partial-logging phrases: the amount and unit the scorer expects.
  amount?: number;
  unit?: string | null;
}

export const SPOKEN_PHRASES = spoken.phrases as SpokenPhrase[];

// The habits those phrases are about, so the recogniser favours the same names as it would
// for someone who has them.
export const SPOKEN_HABIT_NAMES = [
  'Read', 'book', 'novel', 'Morning run', 'jog', 'Gym', 'workout', 'Meditate', 'dhyan',
  'Drink water', 'paani', 'Evening walk', 'Study', 'padhai',
];
