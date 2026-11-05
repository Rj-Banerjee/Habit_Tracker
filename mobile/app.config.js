// The design review build (EXPO_PUBLIC_DESIGN_REVIEW=1) installs as its own app, next to
// the real one, so reviewing animations never replaces the app in daily use.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_DESIGN_REVIEW !== '1') return config;
  return {
    ...config,
    name: `${config.name} Review`,
    scheme: `${config.scheme}-review`,
    android: { ...config.android, package: `${config.android.package}.review` },
    ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.review` },
  };
};
