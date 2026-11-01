const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = defineConfig([
  ...expoConfig,
  // Expo turns on only part of this set. The web app runs all of it.
  { rules: reactHooks.configs.flat['recommended-latest'].rules },
  globalIgnores(['.expo/**', 'dist/**']),
]);
