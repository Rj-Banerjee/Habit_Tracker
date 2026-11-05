import type { ThemeData } from '../theme';

// The look the app has today, as data. Other themes are files of this same shape, bundled
// or downloaded, and checked by validateTheme before they're used.
export const DEFAULT_THEME: ThemeData = {
  id: 'warm-neutral',
  name: 'Warm neutral',
  version: 1,
  kind: 'standard',
  modes: {
    light: {
      colors: {
        canvas: '#F4EFE7',
        surface: '#FBF8F2',
        surfaceSunken: '#EBE4D9',
        border: '#D9D0C2',
        text: '#2B2620',
        textMuted: '#655C50',
        hollow: '#857A6B',
        scrim: '#2B262066',
      },
      identity: {
        'identity-1': { label: 'Pine', accent: '#1D5C30', onAccent: '#FBF8F2' },
        'identity-2': { label: 'Lagoon', accent: '#237D7A', onAccent: '#FBF8F2' },
        'identity-3': { label: 'Harbour', accent: '#004CA9', onAccent: '#FBF8F2' },
        'identity-4': { label: 'Iris', accent: '#7C66A5', onAccent: '#FBF8F2' },
        'identity-5': { label: 'Plum', accent: '#832D77', onAccent: '#FBF8F2' },
        'identity-6': { label: 'Ochre', accent: '#8E6B00', onAccent: '#FBF8F2' },
        'identity-7': { label: 'Copper', accent: '#833D0A', onAccent: '#FBF8F2' },
        'identity-8': { label: 'Stone', accent: '#4D514D', onAccent: '#FBF8F2' },
      },
    },
    dark: {
      colors: {
        canvas: '#1D1A16',
        surface: '#28241F',
        surfaceSunken: '#332E28',
        border: '#463F36',
        text: '#F1EBE1',
        textMuted: '#B5AB9C',
        hollow: '#958A7B',
        scrim: '#0F0D0B99',
      },
      identity: {
        'identity-1': { label: 'Pine', accent: '#91D8A8', onAccent: '#1D1A16' },
        'identity-2': { label: 'Lagoon', accent: '#1FDDF3', onAccent: '#1D1A16' },
        'identity-3': { label: 'Harbour', accent: '#52A2FB', onAccent: '#1D1A16' },
        'identity-4': { label: 'Iris', accent: '#A38AD0', onAccent: '#1D1A16' },
        'identity-5': { label: 'Plum', accent: '#FBA0E0', onAccent: '#1D1A16' },
        'identity-6': { label: 'Ochre', accent: '#AE9F3D', onAccent: '#1D1A16' },
        'identity-7': { label: 'Copper', accent: '#CA8B63', onAccent: '#1D1A16' },
        'identity-8': { label: 'Stone', accent: '#859C8B', onAccent: '#1D1A16' },
      },
    },
  },
  typography: {
    fonts: { regular: 'Figtree_400Regular', medium: 'Figtree_500Medium', semiBold: 'Figtree_600SemiBold' },
    sizes: {
      small: { font: 'medium', fontSize: 13, lineHeight: 18 },
      body: { font: 'regular', fontSize: 16, lineHeight: 23 },
      title: { font: 'semiBold', fontSize: 21, lineHeight: 27 },
      display: { font: 'semiBold', fontSize: 36, lineHeight: 42 },
    },
  },
  radii: { sm: 8, md: 14, full: 999 },
};
