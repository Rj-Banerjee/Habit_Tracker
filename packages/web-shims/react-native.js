// react-native-svg's web build still imports native-only modules for features
// the app doesn't use, such as sound. These stand-ins let it bundle for the web.
export * from 'react-native-web';

export const TurboModuleRegistry = {
  get: () => null,
  getEnforcing: () => null,
};
