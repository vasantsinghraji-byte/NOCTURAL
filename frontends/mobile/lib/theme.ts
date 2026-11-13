import { Appearance, StyleSheet, type ViewStyle } from 'react-native';
import { IS_PARTNER_APP } from './variant';

/**
 * Nabz design tokens, taken from the logo (docs/design/brand-ui): raspberry
 * for the brand header, primary buttons, ADD and the active state; the coral
 * pulse dot for "live" and delivery-time badges; warm ink for text; green
 * only for savings; Plus gold only for Nabz Plus. The Partner app swaps the
 * brand family for the Partner icon's green, so the two apps never look alike.
 * Soft "clay" depth: cards and tiles lift off a warm neutral page, filled
 * buttons have a highlight on top and a darker lip below.
 * Outfit for headings, Manrope for everything else (embedded, see
 * app/_layout.tsx). Follows the phone's light/dark setting at launch.
 * Mirrors frontends/web/app/globals.css.
 */
type BrandFamily = { brand: string; brandLight: string; brandDark: string; brandSoft: string; brandSoftInk: string; tint: string };

// Contrast (white text): raspberry 5.6:1, partner green 5.0:1; dark-mode fills 4.8:1 and 4.5:1.
const BRAND: Record<'customer' | 'partner', { light: BrandFamily; dark: BrandFamily }> = {
  customer: {
    light: { brand: '#b83a50', brandLight: '#d9556b', brandDark: '#a82f45', brandSoft: '#fbeef0', brandSoftInk: '#a82f45', tint: '110,38,52' },
    dark: { brand: '#c4465c', brandLight: '#d9556b', brandDark: '#a82f45', brandSoft: '#3a1c22', brandSoftInk: '#f2a7b4', tint: '0,0,0' }
  },
  partner: {
    light: { brand: '#2f7d5b', brandLight: '#3a8f69', brandDark: '#245c45', brandSoft: '#e6f2ec', brandSoftInk: '#245c45', tint: '22,74,52' },
    dark: { brand: '#358562', brandLight: '#3a8f69', brandDark: '#245c45', brandSoft: '#173328', brandSoftInk: '#9fd8bd', tint: '0,0,0' }
  }
};
const FAMILY = BRAND[IS_PARTNER_APP ? 'partner' : 'customer'];

function palette(b: BrandFamily, dark: boolean) {
  return {
    bg: dark ? '#141110' : '#f7f3f2', // warm neutral page under white cards
    card: dark ? '#211d1b' : '#ffffff',
    cardAlt: dark ? '#2a2523' : '#f5efed',
    ink: dark ? '#f3eeec' : '#2a2523', // warm ink from the wordmark
    inkSoft: dark ? '#dcd4d0' : '#4a423e',
    muted: dark ? '#b9afaa' : '#6f6660', // 5.6:1 on white
    faint: dark ? '#5a504c' : '#c9bfbb',
    border: dark ? '#3a3330' : '#ece6e3',
    brand: b.brand,
    brandLight: b.brandLight,
    brandDark: b.brandDark,
    brandSoft: b.brandSoft,
    onBrand: '#ffffff',
    // Brand header (logo gradient) and what sits on it.
    onHeader: '#ffffff',
    onHeaderMuted: IS_PARTNER_APP ? '#e9f5ef' : '#fbe9ec',
    headerGlass: 'rgba(255,255,255,0.16)',
    headerGlassBorder: 'rgba(255,255,255,0.30)',
    // The pulse dot: live, ETA and offer badges. Ink text on it (4.9:1), never small coral text on white.
    coral: '#ff5a3c',
    coralSoft: dark ? '#3d1d15' : '#ffe9e3',
    coralInk: dark ? '#ffb4a3' : '#c2391f',
    plus: '#f2c14e', // Nabz Plus only
    // Tinted feature surfaces (hero and highlight cards, selected states) with ink text.
    night: b.brandSoft,
    nightAlt: dark ? '#4a2830' : IS_PARTNER_APP ? '#d3e8dc' : '#f6dde1',
    wine: '#14110f', // full-screen calls only
    wine2: '#2a2523',
    onNight: dark ? '#f3eeec' : '#2a2523',
    onNightMuted: dark ? '#b9afaa' : '#6f6660',
    tabBar: dark ? '#211d1b' : '#ffffff',
    accent: b.brand,
    accentSoft: b.brandSoft,
    rose: dark ? '#f97066' : '#c62f1d', // errors: not the brand colour
    roseSoft: dark ? '#3b1512' : '#fef3f2',
    roseInk: dark ? '#fecdca' : '#b42318',
    amber: dark ? '#fdb022' : '#b54708',
    amberSoft: dark ? '#33240b' : '#fffaeb',
    mint: dark ? '#47cd89' : '#0b7a44', // savings, "free", verified (5.4:1)
    mintSoft: dark ? '#0f2d1f' : '#e7f4ec',
    violet: dark ? '#b3a8f5' : '#5b4bb7',
    violetSoft: dark ? '#241f3d' : '#f4f3ff',
    sky: dark ? '#84caff' : '#1f6f99',
    skySoft: dark ? '#102a43' : '#e6f0f5',
    gold: dark ? b.brandSoftInk : b.brand, // small accent labels
    overlay: dark ? 'rgba(0,0,0,0.65)' : 'rgba(42,37,35,0.5)',
    shadow: dark ? '#000000' : '#2a2523',
    tint: b.tint // rgb of the brand shadow, for the clay depth
  };
}

export const IS_DARK = Appearance.getColorScheme() === 'dark';
export const C = palette(IS_DARK ? FAMILY.dark : FAMILY.light, IS_DARK);

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
 * Clay depth (boxShadow, New Architecture). Light from the top-left: a soft
 * highlight inside the top edge and a brand-tinted shadow below, so surfaces
 * look gently moulded rather than flat. Dark mode keeps only a faint rim.
 */
const T = C.tint;
export const depth = {
  /** Cards and list groups. */
  card: (IS_DARK
    ? { boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 10px 20px -10px rgba(0,0,0,0.7)' }
    : { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 22px -12px rgba(${T},0.22), 0 2px 4px rgba(42,37,35,0.05)` }) as ViewStyle,
  /** Puffy icon tiles (services, store icons). */
  tile: (IS_DARK
    ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 16px -8px rgba(0,0,0,0.7)' }
    : { boxShadow: `inset 3px 3px 6px rgba(255,255,255,0.95), inset -3px -4px 8px rgba(${T},0.10), 0 10px 18px -10px rgba(${T},0.35)` }) as ViewStyle,
  /** Things that float: cart bar, brand header, search on the header, sheets. */
  raised: (IS_DARK
    ? { boxShadow: '0 14px 28px -12px rgba(0,0,0,0.8)' }
    : { boxShadow: `0 16px 30px -14px rgba(${T},0.45), 0 4px 10px rgba(42,37,35,0.08)` }) as ViewStyle,
  /** Filled brand buttons: highlight on top, darker lip below, coloured glow. */
  button: (IS_DARK
    ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -3px 0 rgba(0,0,0,0.25), 0 8px 16px -8px rgba(0,0,0,0.7)' }
    : { boxShadow: `inset 0 2px 0 rgba(255,255,255,0.28), inset 0 -3px 0 rgba(0,0,0,0.16), 0 10px 18px -8px rgba(${T},0.55)` }) as ViewStyle,
  /** Pressed: the lip flattens. */
  pressed: { boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.20)' } as ViewStyle
};

/** Card elevation (kept under the old name so every screen picks up the clay depth). */
export const clay: ViewStyle = depth.card;

/** Filled buttons: the clay lip. */
export const clayButton: ViewStyle = depth.button;

/** Corner radii: badges and ADD 8, buttons and inputs 12, cards 16, tiles 20, sheets 28. */
export const R = { sm: 8, md: 12, lg: 16, xl: 20, sheet: 28, full: 999 } as const;

/** Spacing scale (4-point grid). Screen edge is 16. */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** Type ramp (docs/design/brand-ui): use these instead of ad hoc sizes in new code. */
export const TYPE = {
  display: { fontFamily: 'Outfit_700Bold', fontSize: 30, letterSpacing: -0.5, lineHeight: 34 },
  title: { fontFamily: 'Outfit_600SemiBold', fontSize: 22, letterSpacing: -0.3, lineHeight: 28 },
  headline: { fontFamily: 'Outfit_600SemiBold', fontSize: 18, letterSpacing: -0.2, lineHeight: 24 },
  body: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, lineHeight: 21 },
  subhead: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 0.6 }
} as const;

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
  btn: { backgroundColor: C.brand, minHeight: 50, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: R.md, ...depth.button },
  btnText: { color: C.onBrand, fontFamily: F.bold, fontSize: 15 },
  // Kept for existing screens: the same red primary button as btn.
  btnDark: { backgroundColor: C.brand, minHeight: 50, borderRadius: R.md, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', ...depth.button },
  btnOutline: { borderWidth: 1.5, borderColor: C.brand, backgroundColor: C.card, borderRadius: R.md, minHeight: 46, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', ...depth.card },
  btnOutlineText: { color: C.brand, fontFamily: F.bold },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: C.brandSoft },
  pillText: { fontSize: 11, fontFamily: F.bold, color: C.brand },
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 12, borderRadius: R.md, overflow: 'hidden', fontFamily: F.semi },
  good: { backgroundColor: C.mintSoft, padding: 12, borderRadius: R.md }
});
