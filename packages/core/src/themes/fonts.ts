import type { FontRole } from '../theme';

// Typefaces bundled with the apps. A theme names one, and people can swap it for another.
// Atkinson Hyperlegible has no medium or semibold, so it uses regular and bold.
export type FontFamilyId = 'figtree' | 'nunito' | 'lora' | 'atkinson';

export const FONT_FAMILIES: Record<FontFamilyId, { label: string; fonts: Record<FontRole, string> }> = {
  figtree: {
    label: 'Figtree',
    fonts: { regular: 'Figtree_400Regular', medium: 'Figtree_500Medium', semiBold: 'Figtree_600SemiBold' },
  },
  nunito: {
    label: 'Nunito',
    fonts: { regular: 'Nunito_400Regular', medium: 'Nunito_500Medium', semiBold: 'Nunito_600SemiBold' },
  },
  lora: {
    label: 'Lora',
    fonts: { regular: 'Lora_400Regular', medium: 'Lora_500Medium', semiBold: 'Lora_600SemiBold' },
  },
  atkinson: {
    label: 'Atkinson Hyperlegible',
    fonts: {
      regular: 'AtkinsonHyperlegible_400Regular',
      medium: 'AtkinsonHyperlegible_400Regular',
      semiBold: 'AtkinsonHyperlegible_700Bold',
    },
  },
};

export const FONT_FAMILY_IDS = Object.keys(FONT_FAMILIES) as FontFamilyId[];
