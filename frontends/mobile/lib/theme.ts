import { Appearance, StyleSheet, type ViewStyle } from 'react-native';

/**
 * Nabz design tokens: ivory + deep rose + sage green, with soft claymorphism
 * (pillowy depth: gentle lift + a faint light edge, never cartoonish).
 * Instrument Serif for display type, Manrope for everything else (embedded,
 * see app/_layout.tsx). Follows the phone's light/dark setting at launch.
 * Mirrors frontends/web/app/globals.css.
 */
const LIGHT = {
  bg: '#fbf8f3', // ivory
  card: '#fffdf9', // warm white
  cardAlt: '#f4efe7',
  ink: '#2a2523', // warm charcoal
  inkSoft: '#5b524c',
  muted: '#8e857d',
  faint: '#c9c0b6',
  border: '#ece4da',
  brand: '#2f7d5b', // sage-emerald green (links, active, success accents)
  brandDark: '#25644a',
  brandSoft: '#e3f1e8',
  onBrand: '#ffffff',
  night: '#b83a50', // deep rose: primary buttons + hero surfaces
  nightAlt: '#9e2f43',
  onNight: '#fff8f6',
  onNightMuted: '#f8d7dc', // blush
  accent: '#d9485f',
  accentSoft: '#fbe5e8', // blush pink
  rose: '#d9485f',
  roseSoft: '#fbe5e8',
  roseInk: '#a8283d',
  amber: '#b7791f',
  amberSoft: '#fbf0dc',
  mint: '#2f9e6e',
  mintSoft: '#e3f1e8',
  violet: '#8a5a9e',
  violetSoft: '#f3e9f5',
  sky: '#3f7fa8',
  skySoft: '#e6f0f5',
  gold: '#f0c77e', // champagne: readable on rose and ivory
  overlay: 'rgba(42,37,35,0.45)',
  shadow: '#7a4a3a'
};

/**
 * Dark: a deep plum-black (not brown) so the rose and green read as jewel
 * tones; surfaces step up in lightness instead of relying on shadows.
 */
const DARK: typeof LIGHT = {
  bg: '#131014',
  card: '#1d191e',
  cardAlt: '#272128',
  ink: '#f7f1f2',
  inkSoft: '#dcd2d6',
  muted: '#a0959b',
  faint: '#5a5058',
  border: '#332b33',
  brand: '#6fd3a5', // mint-jade
  brandDark: '#9be3c2',
  brandSoft: '#15302a',
  onBrand: '#0d1f18',
  night: '#d4506a', // rose, a touch brighter so it glows on plum-black
  nightAlt: '#b8425a',
  onNight: '#fff8f6',
  onNightMuted: '#fbd9df',
  accent: '#f28b9b',
  accentSoft: '#3a1c26',
  rose: '#f28b9b',
  roseSoft: '#3a1c26',
  roseInk: '#ffc4cd',
  amber: '#e8b25a',
  amberSoft: '#33270f',
  mint: '#6fd3a5',
  mintSoft: '#15302a',
  violet: '#c9a3dc',
  violetSoft: '#2a2030',
  sky: '#86bde0',
  skySoft: '#162630',
  gold: '#ecc684',
  overlay: 'rgba(0,0,0,0.65)',
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
export const PASTELS = [C.accentSoft, C.brandSoft, C.amberSoft, C.violetSoft];

/** Classic drop shadow (used where clay isn't wanted, e.g. floating map pills). */
export const shadow = {
  shadowColor: C.shadow,
  shadowOpacity: IS_DARK ? 0.4 : 0.12,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: IS_DARK ? 0 : 4
};

/**
 * Claymorphism (New Architecture boxShadow): soft lift underneath, a faint
 * light edge on top and a gentle inner shade at the bottom. Subtle by design.
 */
export const clay: ViewStyle = IS_DARK
  ? { boxShadow: '0 14px 30px -10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -3px 8px rgba(0,0,0,0.25)' }
  : { boxShadow: '0 12px 26px -8px rgba(122,74,58,0.22), inset 0 2px 1px rgba(255,255,255,0.9), inset 0 -3px 8px rgba(122,74,58,0.06)' };

/** Clay for filled buttons: puffy, with a light top edge and darker base. */
export const clayButton: ViewStyle = {
  boxShadow: IS_DARK
    ? '0 10px 22px -8px rgba(212,80,106,0.45), inset 0 2px 0 rgba(255,255,255,0.22), inset 0 -3px 0 rgba(0,0,0,0.2)'
    : '0 10px 18px -8px rgba(184,58,80,0.55), inset 0 2px 0 rgba(255,255,255,0.28), inset 0 -3px 0 rgba(0,0,0,0.14)'
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, borderWidth: IS_DARK ? 1 : 0, borderColor: 'rgba(255,255,255,0.05)', ...clay },
  display: { fontFamily: F.display, fontSize: 38, color: C.ink, letterSpacing: -0.5, lineHeight: 42 },
  h1: { fontFamily: F.display, fontSize: 30, color: C.onNight, letterSpacing: -0.3, lineHeight: 34 },
  h2: { fontFamily: F.heavy, fontSize: 19, color: C.ink, letterSpacing: -0.3 },
  h3: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  body: { fontFamily: F.medium, fontSize: 14, color: C.inkSoft, lineHeight: 20 },
  muted: { fontFamily: F.medium, color: C.muted, fontSize: 13 },
  label: { fontFamily: F.bold, color: C.muted, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  section: { fontFamily: F.heavy, fontSize: 17, color: C.ink, marginTop: 20, marginBottom: 10 },
  // No boxShadow on TextInput: on Android it swallows the left padding and the
  // text starts at the border.
  input: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 16,
    paddingLeft: 18, paddingRight: 18, paddingVertical: 13, fontSize: 15, color: C.ink, fontFamily: F.medium
  },
  btn: { backgroundColor: C.brand, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', boxShadow: IS_DARK ? '0 10px 20px -8px rgba(111,211,165,0.3), inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -3px 0 rgba(0,0,0,0.15)' : '0 10px 18px -8px rgba(47,125,91,0.5), inset 0 2px 0 rgba(255,255,255,0.25), inset 0 -3px 0 rgba(0,0,0,0.12)' },
  btnText: { color: C.onBrand, fontFamily: F.heavy, fontSize: 15 },
  btnDark: { backgroundColor: C.night, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', ...clayButton },
  btnOutline: { borderWidth: 1.5, borderColor: C.brand, borderRadius: 18, paddingVertical: 13, alignItems: 'center' },
  btnOutlineText: { color: C.brand, fontFamily: F.bold },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: C.brandSoft },
  pillText: { fontSize: 11, fontFamily: F.heavy, color: C.brand },
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 12, borderRadius: 14, overflow: 'hidden', fontFamily: F.semi },
  good: { backgroundColor: C.brandSoft, padding: 12, borderRadius: 14 }
});
