import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
    alias: [
      { find: /^react-native$/, replacement: '@habit-tracker/web-shims/react-native' },
      {
        find: /^react-native-svg$/,
        replacement: path.join(here, '../node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js'),
      },
      {
        find: '@react-native/assets-registry/registry',
        replacement: path.join(here, '../packages/web-shims/assets-registry.js'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    server: { deps: { inline: ['react-native-web', 'react-native-svg', /@habit-tracker/] } },
  },
});
