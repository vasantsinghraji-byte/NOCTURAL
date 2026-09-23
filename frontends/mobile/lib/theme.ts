import { Appearance, StyleSheet } from 'react-native';

/**
 * Nabz design tokens: midnight + ivory with a royal-blue accent, Instrument
 * Serif for display type and Manrope for everything else (both embedded, see
 * app/_layout.tsx). The palette follows the phone's light/dark setting at
 * launch; styles are created once, so a switch applies on the next app start.
 */
const LIGHT = {
  bg: '#f6f7fb', // ivory
  card: '#ffffff',
  cardAlt: '#eef1f8',
  ink: '#0a0f24', // midnight
  inkSoft: '#3a4260',
  muted: '#7a8299',
  faint: '#b4bccf',
  border: '#e3e7f0',
  brand: '#1f45e0',
  brandDark: '#1533b4',
  brandSoft: '#e8eeff',
  onBrand: '#ffffff',
  night: '#0a0f24', // hero / dark surfaces (dark in both schemes)
  nightAlt: '#141b3a',
  onNight: '#f6f7fb',
  onNightMuted: '#a9b1cc',
  accent: '#f0574b',
  accentSoft: '#fdecec',
  rose: '#e5484d',
  roseSoft: '#fdecec',
  roseInk: '#b42318',
  amber: '#c98a00',
  amberSoft: '#fff4d6',
  mint: '#12a150',
  mintSoft: '#e3f6ec',
  violet: '#6e4ff0',
  violetSoft: '#f1ebff',
  sky: '#2f80ed',
  skySoft: '#e6f0fd',
  gold: '#d4a64a',
  overlay: 'rgba(10,15,36,0.55)',
  shadow: '#0a0f24'
};

const DARK: typeof LIGHT = {
  bg: '#070b1a',
  card: '#10162d',
  cardAlt: '#171e3a',
  ink: '#f3f5fb',
  inkSoft: '#c5cbe0',
  muted: '#8c93ad',
  faint: '#4a5273',
  border: '#232b4a',
  brand: '#5b7cff',
  brandDark: '#8da2ff',
  brandSoft: '#1a2350',
  onBrand: '#ffffff',
  night: '#0d1330',
  nightAlt: '#18204a',
  onNight: '#f6f7fb',
  onNightMuted: '#a9b1cc',
  accent: '#ff7a6e',
  accentSoft: '#2e1418',
  rose: '#ff6b70',
  roseSoft: '#2e1418',
  roseInk: '#ffb3b0',
  amber: '#f5b82e',
  amberSoft: '#2b2410',
  mint: '#3dd68c',
  mintSoft: '#0f2a1f',
  violet: '#9c84ff',
  violetSoft: '#1f1840',
  sky: '#6aa8ff',
  skySoft: '#0f2140',
  gold: '#e7c07a',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000'
};

export const IS_DARK = Appearance.getColorScheme() === 'dark';
export const C = IS_DARK ? DARK : LIGHT;

/** Embedded font families (loaded in app/_layout.tsx before first render). */
export const F = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semi: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold'
};

/** Soft tinted backgrounds for list cards. */
export const PASTELS = [C.accentSoft, C.brandSoft, C.amberSoft, C.mintSoft];

export const shadow = {
  shadowColor: C.shadow,
  shadowOpacity: IS_DARK ? 0.4 : 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: IS_DARK ? 0 : 4
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, borderWidth: IS_DARK ? 1 : 0, borderColor: C.border, ...shadow },
  display: { fontFamily: F.display, fontSize: 38, color: C.ink, letterSpacing: -0.5, lineHeight: 42 },
  h1: { fontFamily: F.display, fontSize: 30, color: C.onNight, letterSpacing: -0.3, lineHeight: 34 },
  h2: { fontFamily: F.heavy, fontSize: 19, color: C.ink, letterSpacing: -0.3 },
  h3: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  body: { fontFamily: F.medium, fontSize: 14, color: C.inkSoft, lineHeight: 20 },
  muted: { fontFamily: F.medium, color: C.muted, fontSize: 13 },
  label: { fontFamily: F.bold, color: C.muted, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  section: { fontFamily: F.heavy, fontSize: 17, color: C.ink, marginTop: 20, marginBottom: 10 },
  input: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink, fontFamily: F.medium
  },
  btn: { backgroundColor: C.brand, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: C.onBrand, fontFamily: F.heavy, fontSize: 15 },
  btnDark: { backgroundColor: C.night, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderWidth: IS_DARK ? 1 : 0, borderColor: C.border },
  btnOutline: { borderWidth: 1.5, borderColor: C.brand, borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  btnOutlineText: { color: C.brand, fontFamily: F.bold },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: C.brandSoft },
  pillText: { fontSize: 11, fontFamily: F.heavy, color: C.brand },
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 12, borderRadius: 12, overflow: 'hidden', fontFamily: F.semi },
  good: { backgroundColor: C.brandSoft, padding: 12, borderRadius: 12 }
});
