import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/lib/T';
import { success, useReducedMotion } from './motion';
import { ART_TONES, C, F } from './theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LENGTH = 70; // length of the tick path below, for the draw-on effect
const DOTS = [0, 45, 90, 135, 180, 225, 270, 315];
const DOT_COLORS = [C.brand, ART_TONES.mint.fg, C.coral, ART_TONES.amber.fg, ART_TONES.sky.fg, C.plus, ART_TONES.violet.fg, C.brandLight];

/**
 * "Order placed": a tick that draws itself in a popping circle, a small burst of
 * colour and a success vibration. Tap anywhere (or wait ~1.7 s) to continue.
 * With "reduce motion" on, it shows the tick without movement and closes sooner.
 */
export function Celebrate({ title, subtitle, onDone }: { title: string; subtitle?: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const pop = useRef(new Animated.Value(reduce ? 1 : 0.4)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const draw = useRef(new Animated.Value(reduce ? 0 : CHECK_LENGTH)).current; // SVG prop, so JS-driven

  useEffect(() => {
    success();
    const moves = reduce ? null : Animated.parallel([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 220, mass: 1 }),
      Animated.timing(draw, { toValue: 0, delay: 180, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(burst, { toValue: 1, delay: 260, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]);
    moves?.start();
    const done = setTimeout(onDone, reduce ? 1100 : 1700);
    return () => { clearTimeout(done); moves?.stop(); };
  }, [reduce, pop, draw, burst, onDone]);

  return (
    <View style={s.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel={`${title}. Tap to continue`} />
      <View style={s.center} pointerEvents="none">
        {!reduce ? DOTS.map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <Animated.View key={angle} style={[s.dot, {
              backgroundColor: DOT_COLORS[i],
              opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0.1] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(rad) * 80] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(rad) * 80] }) },
                { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }
              ]
            }]} />
          );
        }) : null}
        <Animated.View style={[s.badge, { transform: [{ scale: pop }] }]}>
          <Svg width={96} height={96} viewBox="0 0 96 96">
            <Circle cx="48" cy="48" r="46" fill={ART_TONES.mint.fg} />
            <AnimatedPath d="M28 50 L42 63 L69 34" stroke="#ffffff" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none"
              strokeDasharray={[CHECK_LENGTH, CHECK_LENGTH]} strokeDashoffset={draw} />
          </Svg>
        </Animated.View>
      </View>
      <View pointerEvents="none" style={s.textBox}>
        <Text style={s.title} accessibilityLiveRegion="polite">{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  center: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  badge: { boxShadow: '0 12px 30px -10px rgba(11,122,68,0.55)', borderRadius: 48 },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  textBox: { alignItems: 'center', gap: 6, paddingHorizontal: 32 },
  title: { fontFamily: F.display, fontSize: 26, color: C.ink, textAlign: 'center' },
  subtitle: { fontFamily: F.medium, fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 }
});
