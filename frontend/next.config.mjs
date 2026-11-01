import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static files only, so the app can be packaged as a desktop app later.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: [
    '@habit-tracker/core',
    '@habit-tracker/ui',
    '@habit-tracker/web-shims',
    'react-native-web',
    'react-native-svg',
  ],
  turbopack: {
    root: path.join(here, '..'),
    resolveAlias: {
      'react-native': '@habit-tracker/web-shims/react-native',
      '@react-native/assets-registry/registry': '@habit-tracker/web-shims/assets-registry',
    },
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  },
};

export default nextConfig;
