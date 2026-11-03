import { useCallback, useId, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { C, R, depth } from './theme';

/**
 * White status-bar icons while a brand header is on screen. Only the focused
 * screen renders it, so going back to (or pushing) a light screen drops the
 * entry and the root's dark icons return.
 */
export function LightStatusBar() {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  return focused ? <StatusBar style="light" /> : null;
}

/**
 * The logo gradient (raspberry in the Nabz app, green in Nabz Partner) with a
 * soft highlight top-right and a deeper glow bottom-left, so the surface reads
 * as gently moulded. Fills its parent; put it first inside a View.
 */
export function BrandGradient({ radius = 0 }: { radius?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.brandLight} />
            <Stop offset="0.45" stopColor={C.brand} />
            <Stop offset="1" stopColor={C.brandDark} />
          </LinearGradient>
          <RadialGradient id={`h${id}`} cx="85%" cy="0%" r="60%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`s${id}`} cx="0%" cy="100%" r="55%">
            <Stop offset="0" stopColor="#000000" stopOpacity="0.14" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#g${id})`} />
        <Rect width="100%" height="100%" fill={`url(#h${id})`} />
        <Rect width="100%" height="100%" fill={`url(#s${id})`} />
        {/* A faint ring echoing the logo's pin, top-right. */}
        <Circle cx="92%" cy="8%" r="90" fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="22" />
      </Svg>
    </View>
  );
}

/**
 * Brand header for tab screens: the gradient band from the top of the screen
 * (under the status bar) with rounded bottom corners and a soft lift. Children
 * use C.onHeader / C.onHeaderMuted for text and C.headerGlass for chips.
 */
export function BrandHeader({ children, style, bleed = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; bleed?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, depth.raised, bleed ? { marginHorizontal: -bleed } : null]}>
      <View style={[s.band, { paddingTop: insets.top + 10 }, style]}>
        <BrandGradient />
        <LightStatusBar />
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderBottomLeftRadius: R.sheet, borderBottomRightRadius: R.sheet, backgroundColor: C.brand },
  band: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: R.sheet, borderBottomRightRadius: R.sheet, overflow: 'hidden' }
});
