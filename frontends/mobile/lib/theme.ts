import { Appearance, StyleSheet, type ViewStyle } from 'react-native';

/**
 * Nabz design tokens: crimson + wine on clean cool-white surfaces (the
 * CardioLife direction): crimson for actions and heroes, wine for depth,
 * green only for success. Outfit for display type, Manrope for everything
 * else (embedded, see app/_layout.tsx). Follows the phone's light/dark setting
 * at launch. Mirrors frontends/web/app/globals.css.
 */
const LIGHT = {
  bg: '#f5f3f4',
  card: '#ffffff',
  cardAlt: '#f1ecee',
  ink: '#1f1a1c',
  inkSoft: '#4f4649',
  muted: '#8a7f83',
  faint: '#c4babe',
  border: '#ebe4e6',
  brand: '#c21f3d', // crimson: links, active, primary actions
  brandDark: '#9a1832',
  brandSoft: '#fde7eb',
  onBrand: '#ffffff',
  night: '#b8243f', // crimson hero surfaces + dark buttons
  nightAlt: '#7d1530',
  wine: '#5c0d22', // deep wine (hero gradients, tab bar glow)
  wine2: '#8e1a33',
  onNight: '#fff6f7',
  onNightMuted: '#ffd3da',
  tabBar: '#1c1719', // dark pill bottom nav
  accent: '#e0435f',
  accentSoft: '#fde7eb',
  rose: '#e0435f',
  roseSoft: '#fde7eb',
  roseInk: '#9a1832',
  amber: '#b7791f',
  amberSoft: '#fbf0dc',
  mint: '#1f9d6b', // success only
  mintSoft: '#e2f4ec',
  violet: '#8a5a9e',
  violetSoft: '#f3e9f5',
  sky: '#3f7fa8',
  skySoft: '#e6f0f5',
  gold: '#ffc94d',
  overlay: 'rgba(31,26,28,0.5)',
  shadow: '#5c0d22'
};

/** Dark: near-black with a hint of wine; crimson brightens so it glows. */
const DARK: typeof LIGHT = {
  bg: '#121012',
  card: '#1c181b',
  cardAlt: '#262025',
  ink: '#f7f1f3',
  inkSoft: '#dcd2d6',
  muted: '#a0959b',
  faint: '#5a5058',
  border: '#332b31',
  brand: '#ff5c78',
  brandDark: '#ff8a9e',
  brandSoft: '#3a1820',
  onBrand: '#ffffff',
  night: '#c0294a',
  nightAlt: '#7d1530',
  wine: '#3d0816',
  wine2: '#6b1028',
  onNight: '#fff6f7',
  onNightMuted: '#ffd3da',
  tabBar: '#0b090a',
  accent: '#ff7f95',
  accentSoft: '#3a1820',
  rose: '#ff7f95',
  roseSoft: '#3a1820',
  roseInk: '#ffc4cd',
  amber: '#e8b25a',
  amberSoft: '#33270f',
  mint: '#5fd3a0',
  mintSoft: '#15302a',
  violet: '#c9a3dc',
  violetSoft: '#2a2030',
  sky: '#86bde0',
  skySoft: '#162630',
  gold: '#ffd166',
  overlay: 'rgba(0,0,0,0.65)',
  shadow: '#000000'
};

export const IS_DARK = Appearance.getColorScheme() === 'dark';
export const C = IS_DARK ? DARK : LIGHT;

/** Embedded font families (loaded in app/_layout.tsx before first render). */
export const F = {
  display: 'Outfit_700Bold',
  displayItalic: 'Outfit_600SemiBold',
  displayHeavy: 'Outfit_800ExtraBold',
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
  : { boxShadow: '0 12px 26px -8px rgba(92,13,34,0.16), inset 0 2px 1px rgba(255,255,255,0.9), inset 0 -3px 8px rgba(92,13,34,0.05)' };

/** Clay for filled buttons: puffy, with a light top edge and darker base. */
export const clayButton: ViewStyle = {
  boxShadow: IS_DARK
    ? '0 10px 22px -8px rgba(255,92,120,0.4), inset 0 2px 0 rgba(255,255,255,0.22), inset 0 -3px 0 rgba(0,0,0,0.2)'
    : '0 10px 18px -8px rgba(194,31,61,0.55), inset 0 2px 0 rgba(255,255,255,0.28), inset 0 -3px 0 rgba(0,0,0,0.14)'
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, borderWidth: IS_DARK ? 1 : 0, borderColor: 'rgba(255,255,255,0.05)', ...clay },
  display: { fontFamily: F.display, fontSize: 34, color: C.ink, letterSpacing: -1, lineHeight: 40 },
  h1: { fontFamily: F.display, fontSize: 28, color: C.onNight, letterSpacing: -0.6, lineHeight: 34 },
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
  btn: { backgroundColor: C.brand, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 999, ...clayButton },
  btnText: { color: C.onBrand, fontFamily: F.heavy, fontSize: 15 },
  btnDark: { backgroundColor: C.night, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', ...clayButton },
  btnOutline: { borderWidth: 1.5, borderColor: C.brand, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  btnOutlineText: { color: C.brand, fontFamily: F.bold },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: C.brandSoft },
  pillText: { fontSize: 11, fontFamily: F.heavy, color: C.brand },
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 12, borderRadius: 14, overflow: 'hidden', fontFamily: F.semi },
  good: { backgroundColor: C.mintSoft, padding: 12, borderRadius: 14 }
});
