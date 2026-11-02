import { requireOptionalNativeModule } from 'expo';
import type { SpeechInput } from './speechInput';

// A native module, so it's missing from Expo Go. Null there means the sheet offers
// the text box, where the keyboard's own mic still works. The check comes first
// because just loading the package reports an error when the module is missing.
function loadModule() {
  if (!requireOptionalNativeModule('ExpoSpeechRecognition')) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-speech-recognition').ExpoSpeechRecognitionModule;
}

export function speechInput(): SpeechInput | null {
  const recognizer = loadModule();
  if (!recognizer?.isRecognitionAvailable()) return null;

  return {
    async start({ language, hints }, onText, onEnd) {
      const { granted } = await recognizer.requestPermissionsAsync();
      if (!granted) return false;

      const listeners = [
        recognizer.addListener('result', (event: { results: { transcript: string }[] }) =>
          onText(event.results[0]?.transcript ?? '')
        ),
        recognizer.addListener('end', () => {
          listeners.forEach((listener) => listener.remove());
          onEnd();
        }),
      ];
      recognizer.start({
        lang: language,
        interimResults: true,
        contextualStrings: hints,
        // Stays on the phone wherever the phone can do this language.
        requiresOnDeviceRecognition: recognizer.supportsOnDeviceRecognition(),
      });
      return true;
    },
    stop: () => recognizer.stop(),
  };
}
