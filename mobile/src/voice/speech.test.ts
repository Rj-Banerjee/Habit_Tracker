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
      stop: jest.fn(),
      addListener: (name: string, listener: (event?: unknown) => void) => {
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
const mockListeners: Record<string, (event?: unknown) => void> = {};
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
    expect(mockRemove).toHaveBeenCalledTimes(3);
  });

  it("doesn't start without microphone permission", async () => {
    nativeModule.mockReturnValue({});
    mockGranted.mockResolvedValueOnce({ granted: false });
    const started = await speechInput()?.start({ language: 'en-IN', hints: [] }, jest.fn(), jest.fn());
    expect(started).toBe(false);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('carries on online when the language has no on-device pack, and remembers it', async () => {
    nativeModule.mockReturnValue({});
    const input = speechInput();
    const onEnd = jest.fn();
    await input?.start({ language: 'hi-IN', hints: [] }, jest.fn(), onEnd);
    mockListeners.error({ error: 'language-not-supported' });
    mockListeners.end();
    expect(onEnd).not.toHaveBeenCalled();
    expect(mockStart).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'hi-IN', requiresOnDeviceRecognition: false }));
    mockListeners.end();
    expect(onEnd).toHaveBeenCalledTimes(1);

    await speechInput()?.start({ language: 'hi-IN', hints: [] }, jest.fn(), jest.fn());
    expect(mockStart).toHaveBeenLastCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
  });

  it('ends normally when they let go during the switch', async () => {
    nativeModule.mockReturnValue({});
    const input = speechInput();
    const onEnd = jest.fn();
    await input?.start({ language: 'mr-IN' as never, hints: [] }, jest.fn(), onEnd);
    mockListeners.error({ error: 'language-not-supported' });
    input?.stop();
    mockListeners.end();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('treats other errors as the end of listening', async () => {
    nativeModule.mockReturnValue({});
    const onEnd = jest.fn();
    await speechInput()?.start({ language: 'en-IN', hints: [] }, jest.fn(), onEnd);
    mockListeners.error({ error: 'no-speech' });
    mockListeners.end();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
