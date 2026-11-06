import type { ThemeData, ThemeMode } from '../theme';
import type { ThemeColors, ThemeName } from '../tokens';
import { DEFAULT_THEME } from './default';
import { FONT_FAMILIES, FontFamilyId } from './fonts';

// The standard themes, free on every plan. Each one tints the default's neutrals with its
// own hue at the same lightness, so text and the identity accents stay exactly as readable,
// and pairs that with a typeface and corner shape. tokens.test.ts holds every one of them
// to the default's rules.

const standard = (
  id: string,
  name: string,
  font: FontFamilyId,
  radii: { sm: number; md: number },
  colors: Record<ThemeName, ThemeColors>
): ThemeData => {
  const mode = (m: ThemeName): ThemeMode => ({ colors: colors[m], identity: DEFAULT_THEME.modes[m].identity });
  return {
    ...DEFAULT_THEME,
    id,
    name,
    modes: { light: mode('light'), dark: mode('dark') },
    typography: { ...DEFAULT_THEME.typography, fonts: FONT_FAMILIES[font].fonts },
    radii: { ...radii, full: 999 },
  };
};

export const STANDARD_THEMES: ThemeData[] = [
  DEFAULT_THEME,
  standard('paper', 'Paper', 'figtree', { sm: 6, md: 10 }, {
    light: {
      canvas: '#EEF0F1', surface: '#F8F8F9', surfaceSunken: '#E2E5E8', border: '#CED2D7',
      text: '#24272C', textMuted: '#565E69', hollow: '#727C8B', scrim: '#24272C66',
    },
    dark: {
      canvas: '#181B1E', surface: '#212529', surfaceSunken: '#2B2F35', border: '#3B4148',
      text: '#EAEBEE', textMuted: '#A6ADB6', hollow: '#838C9A', scrim: '#0C0D0F99',
    },
  }),
  standard('sage', 'Sage', 'nunito', { sm: 10, md: 18 }, {
    light: {
      canvas: '#ECF0EB', surface: '#F7F9F6', surfaceSunken: '#DFE7DE', border: '#C7D5C5',
      text: '#212920', textMuted: '#50624D', hollow: '#6A8266', scrim: '#21292066',
    },
    dark: {
      canvas: '#161C15', surface: '#1E271C', surfaceSunken: '#263224', border: '#354532',
      text: '#E8EDE8', textMuted: '#A0B29C', hollow: '#7A9275', scrim: '#0B0E0A99',
    },
  }),
  standard('dusk', 'Dusk', 'figtree', { sm: 8, md: 14 }, {
    light: {
      canvas: '#EEEFF3', surface: '#F8F8FA', surfaceSunken: '#E2E4EB', border: '#CDD1DC',
      text: '#24262F', textMuted: '#565D71', hollow: '#727B95', scrim: '#24262F66',
    },
    dark: {
      canvas: '#181B22', surface: '#21252F', surfaceSunken: '#2A2E3C', border: '#393F52',
      text: '#EAECEF', textMuted: '#A7ACBC', hollow: '#848BA2', scrim: '#0C0D1299',
    },
  }),
  standard('sand', 'Sand', 'lora', { sm: 6, md: 12 }, {
    light: {
      canvas: '#F4EFE6', surface: '#FAF8F4', surfaceSunken: '#ECE4D4', border: '#DDD0B3',
      text: '#2A261E', textMuted: '#655D49', hollow: '#867A61', scrim: '#2A261E66',
    },
    dark: {
      canvas: '#1F190E', surface: '#2B2413', surfaceSunken: '#372E18', border: '#4B3F22',
      text: '#EDEBE7', textMuted: '#B4AC98', hollow: '#968B6F', scrim: '#100D0799',
    },
  }),
  standard('blush', 'Blush', 'nunito', { sm: 12, md: 20 }, {
    light: {
      canvas: '#F4EFF1', surface: '#FAF8F9', surfaceSunken: '#EDE2E7', border: '#DFCCD6',
      text: '#2E2429', textMuted: '#6E5762', hollow: '#917482', scrim: '#2E242966',
    },
    dark: {
      canvas: '#23161D', surface: '#312028', surfaceSunken: '#3E2833', border: '#563746',
      text: '#EFEAED', textMuted: '#BAA7B1', hollow: '#9F8592', scrim: '#120C0F99',
    },
  }),
  standard('slate', 'Slate', 'figtree', { sm: 4, md: 8 }, {
    light: {
      canvas: '#EEF0F0', surface: '#F8F9F9', surfaceSunken: '#E4E5E7', border: '#CED1D4',
      text: '#242729', textMuted: '#585F63', hollow: '#747D83', scrim: '#24272966',
    },
    dark: {
      canvas: '#191B1C', surface: '#232527', surfaceSunken: '#2C2F32', border: '#3C4144',
      text: '#EAECEC', textMuted: '#A7ADB1', hollow: '#848C92', scrim: '#0D0E0E99',
    },
  }),
  standard('lavender', 'Lavender', 'nunito', { sm: 10, md: 16 }, {
    light: {
      canvas: '#F1EFF4', surface: '#F9F7FA', surfaceSunken: '#E7E4ED', border: '#D5CEDF',
      text: '#292530', textMuted: '#645875', hollow: '#847597', scrim: '#29253066',
    },
    dark: {
      canvas: '#1D1825', surface: '#282232', surfaceSunken: '#332B40', border: '#473B58',
      text: '#EDEAF0', textMuted: '#B1A9BE', hollow: '#9386A4', scrim: '#0F0C1399',
    },
  }),
  standard('linen', 'Linen', 'lora', { sm: 4, md: 10 }, {
    light: {
      canvas: '#F3EFEC', surface: '#FAF8F7', surfaceSunken: '#EAE4DF', border: '#D9D0C6',
      text: '#2A2623', textMuted: '#655B52', hollow: '#86796D', scrim: '#2A262366',
    },
    dark: {
      canvas: '#1F1914', surface: '#2B231C', surfaceSunken: '#372D24', border: '#4A3E32',
      text: '#EDECEA', textMuted: '#B3ABA2', hollow: '#958A7E', scrim: '#0F0D0A99',
    },
  }),
  standard('moss', 'Moss', 'figtree', { sm: 10, md: 16 }, {
    light: {
      canvas: '#EEF0EA', surface: '#F8F8F6', surfaceSunken: '#E3E6DC', border: '#CDD3C0',
      text: '#25271F', textMuted: '#59604B', hollow: '#768064', scrim: '#25271F66',
    },
    dark: {
      canvas: '#191B13', surface: '#23261B', surfaceSunken: '#2C3022', border: '#3C422E',
      text: '#EBEDE7', textMuted: '#A8B09A', hollow: '#859071', scrim: '#0C0E0A99',
    },
  }),
  standard('ink', 'Ink', 'atkinson', { sm: 6, md: 10 }, {
    light: {
      canvas: '#EFEFF1', surface: '#F8F9F9', surfaceSunken: '#E4E5E6', border: '#D0D1D4',
      text: '#262729', textMuted: '#5B5D63', hollow: '#7A7B84', scrim: '#26272966',
    },
    dark: {
      canvas: '#1A1A1C', surface: '#242427', surfaceSunken: '#2E2F32', border: '#3F3F44',
      text: '#EBECED', textMuted: '#ABACB2', hollow: '#8A8C93', scrim: '#0D0E0E99',
    },
  }),
];
