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
    },
  };
});

const mockOnDevice = jest.fn(() => true);
const nativeModule = requireOptionalNativeModule as jest.Mock;

describe('speechInput', () => {
  beforeEach(() => jest.clearAllMocks());

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

  it("stays off on a phone that can't work on-device, so no audio leaves it", () => {
    nativeModule.mockReturnValue({});
    mockOnDevice.mockReturnValue(false);
    expect(speechInput()).toBeNull();
  });
});
