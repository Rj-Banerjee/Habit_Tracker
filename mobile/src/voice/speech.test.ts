import { requireOptionalNativeModule } from 'expo';
import { speechInput } from './speech';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

const mockPackageLoaded = jest.fn();
jest.mock('expo-speech-recognition', () => {
  mockPackageLoaded();
  return {
    ExpoSpeechRecognitionModule: {
      isRecognitionAvailable: () => true,
      supportsOnDeviceRecognition: mockOnDevice,
      requestPermissionsAsync: mockGranted,
      start: mockStart,
      addListener: (name: string, listener: () => void) => {
        mockListeners[name] = listener;
        return { remove: mockRemove };
      },
    },
  };
});

const mockOnDevice = jest.fn(() => true);
const mockGranted = jest.fn(async () => ({ granted: true }));
const mockStart = jest.fn();
const mockRemove = jest.fn();
const mockListeners: Record<string, () => void> = {};
const nativeModule = requireOptionalNativeModule as jest.Mock;

describe('speechInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnDevice.mockReturnValue(true);
  });

  // Expo Go: loading the package there reports a missing native module.
  it("doesn't touch the package when the native module is missing", () => {
    nativeModule.mockReturnValue(null);
    expect(speechInput()).toBeNull();
    expect(mockPackageLoaded).not.toHaveBeenCalled();
  });

  it('is offered in a development build', () => {
    nativeModule.mockReturnValue({});
    expect(speechInput()).not.toBeNull();
  });

  it('prefers on-device, and passes the language and hints', async () => {
    nativeModule.mockReturnValue({});
    const input = speechInput();
    await input?.start({ language: 'hi-IN', hints: ['Read', 'undo'] }, jest.fn(), jest.fn());
    expect(mockStart).toHaveBeenCalledWith({
      lang: 'hi-IN',
      interimResults: true,
      contextualStrings: ['Read', 'undo'],
      requiresOnDeviceRecognition: true,
    });
  });

  it("still listens on a phone that can't work on-device", async () => {
    nativeModule.mockReturnValue({});
    mockOnDevice.mockReturnValue(false);
    await speechInput()?.start({ language: 'en-IN', hints: [] }, jest.fn(), jest.fn());
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: false })
    );
  });

  it('removes its listeners when listening ends, so results are never doubled', async () => {
    nativeModule.mockReturnValue({});
    await speechInput()?.start({ language: 'en-IN', hints: [] }, jest.fn(), jest.fn());
    mockListeners.end();
    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  it("doesn't start without microphone permission", async () => {
    nativeModule.mockReturnValue({});
    mockGranted.mockResolvedValueOnce({ granted: false });
    const started = await speechInput()?.start({ language: 'en-IN', hints: [] }, jest.fn(), jest.fn());
    expect(started).toBe(false);
    expect(mockStart).not.toHaveBeenCalled();
  });
});
