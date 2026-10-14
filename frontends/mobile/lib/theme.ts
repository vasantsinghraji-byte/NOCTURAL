import { Appearance, StyleSheet, type ViewStyle } from 'react-native';

/**
 * Nabz design tokens (quick-commerce direction): calm neutral surfaces, one
 * brand red used only for actions and the active state, ink for dark surfaces
 * (cart bar, live visit card), green only for success and savings. Flat cards
 * with hairline borders, 12–16 px corners, rectangular buttons. Outfit
 * semibold for headings, Manrope for everything else (embedded, see
 * app/_layout.tsx). Follows the phone's light/dark setting at launch.
 * Mirrors frontends/web/app/globals.css.
 */
const LIGHT = {
  bg: '#f4f5f7',
  card: '#ffffff',
  cardAlt: '#f1f2f5',
  ink: '#111418',
  inkSoft: '#3d434c',
  muted: '#5f6670', // 5.6:1 on bg: readable secondary text
  faint: '#c5c9d0',
  border: '#e4e7ec',
  brand: '#c8102e', // Nabz red: primary actions, links, active state
  brandDark: '#9e0c24',
  brandSoft: '#fdecee',
  onBrand: '#ffffff',
  night: '#16191e', // ink surfaces: cart bar, live visit card, dark buttons
  nightAlt: '#262a31',
  wine: '#0f1115', // deepest ink (illustration shading)
  wine2: '#22262d',
  onNight: '#ffffff',
  onNightMuted: '#b9bec7',
  tabBar: '#ffffff',
  accent: '#c8102e',
  accentSoft: '#fdecee',
  rose: '#d92d20', // errors
  roseSoft: '#fef3f2',
  roseInk: '#b42318',
  amber: '#b54708',
  amberSoft: '#fffaeb',
  mint: '#0f8a4f', // success, savings, "in stock"
  mintSoft: '#ecfdf3',
  violet: '#5b4bb7',
  violetSoft: '#f4f3ff',
  sky: '#175cd3',
  skySoft: '#eff8ff',
  gold: '#f5b301',
  overlay: 'rgba(16,24,40,0.5)',
  shadow: '#101828'
};

const DARK: typeof LIGHT = {
  bg: '#0e1013',
  card: '#171a1f',
  cardAlt: '#1f2329',
  ink: '#f2f4f7',
  inkSoft: '#d0d5dd',
  muted: '#98a2b3',
  faint: '#475467',
  border: '#2a2f36',
  brand: '#ff4d67',
  brandDark: '#ff8095',
  brandSoft: '#3a161d',
  onBrand: '#ffffff',
  night: '#1f2329',
  nightAlt: '#2a2f36',
  wine: '#0b0d10',
  wine2: '#1f2329',
  onNight: '#ffffff',
  onNightMuted: '#b9bec7',
  tabBar: '#171a1f',
  accent: '#ff4d67',
  accentSoft: '#3a161d',
  rose: '#f97066',
  roseSoft: '#3b1512',
  roseInk: '#fecdca',
  amber: '#fdb022',
  amberSoft: '#33240b',
  mint: '#47cd89',
  mintSoft: '#0f2d1f',
  violet: '#b3a8f5',
  violetSoft: '#241f3d',
  sky: '#84caff',
  skySoft: '#102a43',
  gold: '#fdb022',
  overlay: 'rgba(0,0,0,0.65)',
  shadow: '#000000'
};

export const IS_DARK = Appearance.getColorScheme() === 'dark';
export const C = IS_DARK ? DARK : LIGHT;

/**
 * Embedded font families (loaded in app/_layout.tsx before first render).
 * Headings are semibold and text tops out at bold: extra-bold everywhere
 * reads as shouting, so `heavy` / `displayHeavy` resolve to bold.
 */
export const F = {
  display: 'Outfit_600SemiBold',
  displayItalic: 'Outfit_600SemiBold',
  displayHeavy: 'Outfit_700Bold',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semi: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_700Bold'
};

/** Background for list cards: one neutral tint (rotating pastels read as decoration). */
export const PASTELS = [C.cardAlt, C.cardAlt, C.cardAlt, C.cardAlt];

/** Raised surfaces that float over content (map pills, sheets). */
export const shadow = {
  shadowColor: C.shadow,
  shadowOpacity: IS_DARK ? 0.4 : 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: IS_DARK ? 0 : 3
};

/**
 * Card elevation: a hairline-level lift, nothing puffy. (Kept under the old
 * name so every screen picks it up.)
 */
export const clay: ViewStyle = IS_DARK
  ? { boxShadow: '0 0 0 1px rgba(255,255,255,0.04)' }
  : { boxShadow: '0 1px 2px rgba(16,24,40,0.05)' };

/** Filled buttons are flat: colour and type carry them. */
export const clayButton: ViewStyle = {};

/** Corner radii: controls 12, cards 16, capsules for chips only. */
export const R = { sm: 8, md: 12, lg: 16, full: 999 } as const;

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 16, borderWidth: 1, borderColor: C.border, ...clay },
  display: { fontFamily: F.display, fontSize: 28, color: C.ink, letterSpacing: -0.5, lineHeight: 34 },
  h1: { fontFamily: F.display, fontSize: 24, color: C.onNight, letterSpacing: -0.4, lineHeight: 30 },
  h2: { fontFamily: F.bold, fontSize: 18, color: C.ink, letterSpacing: -0.2 },
  h3: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  body: { fontFamily: F.medium, fontSize: 15, color: C.inkSoft, lineHeight: 22 },
  muted: { fontFamily: F.medium, color: C.muted, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: F.semi, color: C.muted, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  section: { fontFamily: F.bold, fontSize: 17, color: C.ink, marginTop: 24, marginBottom: 10 },
  // No boxShadow on TextInput: on Android it swallows the left padding and the
  // text starts at the border.
  input: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: R.md,
    paddingLeft: 16, paddingRight: 16, paddingVertical: 13, fontSize: 15, color: C.ink, fontFamily: F.medium
  },
  btn: { backgroundColor: C.brand, minHeight: 50, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: R.md },
  btnText: { color: C.onBrand, fontFamily: F.bold, fontSize: 15 },
  btnDark: { backgroundColor: C.night, minHeight: 50, borderRadius: R.md, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 1, borderColor: C.brand, borderRadius: R.md, minHeight: 46, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnOutlineText: { color: C.brand, fontFamily: F.bold },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: C.brandSoft },
  pillText: { fontSize: 11, fontFamily: F.bold, color: C.brand },
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 12, borderRadius: R.md, overflow: 'hidden', fontFamily: F.semi },
  good: { backgroundColor: C.mintSoft, padding: 12, borderRadius: R.md }
});
