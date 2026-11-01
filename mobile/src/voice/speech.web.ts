import type { SpeechInput } from './speechInput';

interface BrowserRecognition {
  lang: string;
  interimResults: boolean;
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

type Recognition = new () => BrowserRecognition;
const browser = globalThis as unknown as {
  SpeechRecognition?: Recognition;
  webkitSpeechRecognition?: Recognition;
};

export function speechInput(): SpeechInput | null {
  const Recognizer = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  if (!Recognizer) return null;

  let active: BrowserRecognition | null = null;
  return {
    async start(onText, onEnd) {
      active = new Recognizer();
      active.lang = navigator.language;
      active.interimResults = true;
      active.onresult = ({ results }) =>
        onText(Array.from(results, (result) => result[0].transcript).join(' '));
      active.onend = onEnd;
      active.start();
      return true;
    },
    stop: () => active?.stop(),
  };
}
