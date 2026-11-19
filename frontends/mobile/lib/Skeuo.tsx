import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { C, IS_DARK, depth } from './theme';

/**
 * Skeuomorphic detail (docs/design/brand-ui): light falls from the top, so a
 * raised surface is brightest at its top edge. Gloss is that highlight; put it
 * inside any filled button or bar (it ignores touches and follows the radius).
 */
export function Gloss({ radius = 12, strength = 1 }: { radius?: number; strength?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`gl${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.30 * strength} />
            <Stop offset="0.48" stopColor="#ffffff" stopOpacity={0.08 * strength} />
            <Stop offset="0.52" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.10 * strength} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#gl${id})`} />
      </Svg>
    </View>
  );
}

/**
 * An embossed tile: a white face that shades slightly toward the bottom, a
 * highlight on the top edge and a soft brand-tinted shadow below, so icons sit
 * on something you could press.
 */
export function EmbossTile({ children, size = 72, radius = 22, tint, style }: { children: ReactNode; size?: number; radius?: number; tint?: string; style?: StyleProp<ViewStyle> }) {
  const id = useId().replace(/:/g, '');
  const top = IS_DARK ? C.cardAlt : '#ffffff';
  const bottom = IS_DARK ? C.card : tint || '#f6eeec';
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', backgroundColor: top }, depth.tile, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`em${id}`} x1="0" y1="0" x2="0.4" y2="1">
              <Stop offset="0" stopColor={top} />
              <Stop offset="1" stopColor={bottom} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#em${id})`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}
