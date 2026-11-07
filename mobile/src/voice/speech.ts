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

// Languages this phone said it can't do on-device, usually because their speech pack isn't
// downloaded. They use the phone's online recogniser from then on, so they don't stall.
const notOnDevice = new Set<string>();

export function speechInput(): SpeechInput | null {
  const recognizer = loadModule();
  if (!recognizer?.isRecognitionAvailable()) return null;
  let holding = false;

  return {
    async start({ language, hints }, onText, onEnd) {
      const { granted } = await recognizer.requestPermissionsAsync();
      if (!granted) return false;

      const listen = (onDevice: boolean) =>
        recognizer.start({
          lang: language,
          interimResults: true,
          contextualStrings: hints,
          requiresOnDeviceRecognition: onDevice,
        });
      // Stays on the phone wherever the phone can do this language.
      const onDevice = recognizer.supportsOnDeviceRecognition() && !notOnDevice.has(language);
      let switching = false;

      const listeners = [
        recognizer.addListener('result', (event: { results: { transcript: string }[] }) =>
          onText(event.results[0]?.transcript ?? '')
        ),
        // Without the language's pack, on-device listening ends at once. Carry on online,
        // while they're still holding, instead of looking like the button let go.
        recognizer.addListener('error', (event: { error: string }) => {
          if (event.error === 'language-not-supported' && onDevice && !switching) {
            notOnDevice.add(language);
            switching = holding;
          }
        }),
        recognizer.addListener('end', () => {
          if (switching) {
            switching = false;
            // Let go mid-switch: nothing more to hear.
            if (holding) {
              listen(false);
              return;
            }
          }
          holding = false;
          listeners.forEach((listener) => listener.remove());
          onEnd();
        }),
      ];
      holding = true;
      listen(onDevice);
      return true;
    },
    stop: () => {
      holding = false;
      recognizer.stop();
    },
  };
}
