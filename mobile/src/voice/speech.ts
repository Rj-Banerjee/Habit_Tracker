import type { SpeechInput } from './speechInput';

// A native module, so it's missing from Expo Go. Null there means the sheet offers
// the text box, where the keyboard's own mic still works.
function loadModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

export function speechInput(): SpeechInput | null {
  const recognizer = loadModule();
  // No audio leaves the phone, so a device that can't do this on its own goes without.
  if (!recognizer?.isRecognitionAvailable() || !recognizer.supportsOnDeviceRecognition()) {
    return null;
  }

  return {
    async start(onText, onEnd) {
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
      recognizer.start({ lang: 'en-US', interimResults: true, requiresOnDeviceRecognition: true });
      return true;
    },
    stop: () => recognizer.stop(),
  };
}
