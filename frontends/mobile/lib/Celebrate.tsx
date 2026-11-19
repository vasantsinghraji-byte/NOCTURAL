import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/lib/T';
import { success } from './motion';
import { ART_TONES, C, F } from './theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LENGTH = 70; // length of the tick path below, for the draw-on effect
const DOTS = [0, 45, 90, 135, 180, 225, 270, 315];
const DOT_COLORS = [C.brand, ART_TONES.mint.fg, C.coral, ART_TONES.amber.fg, ART_TONES.sky.fg, C.plus, ART_TONES.violet.fg, C.brandLight];

function Dot({ angle, color, delay }: { angle: number; color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })); }, [delay, t]);
  const style = useAnimatedStyle(() => {
    const r = 70 * t.value;
    const rad = (angle * Math.PI) / 180;
    return { opacity: 1 - t.value * 0.9, transform: [{ translateX: Math.cos(rad) * r }, { translateY: Math.sin(rad) * r }, { scale: 1 - t.value * 0.5 }] };
  });
  return <Animated.View style={[s.dot, { backgroundColor: color }, style]} />;
}

/**
 * "Order placed": a tick that draws itself in a popping circle, a small burst of
 * colour and a success vibration. Tap anywhere (or wait ~1.6 s) to continue.
 * With "reduce motion" on, it shows the tick without movement and closes sooner.
 */
export function Celebrate({ title, subtitle, onDone }: { title: string; subtitle?: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const pop = useSharedValue(reduce ? 1 : 0.4);
  const draw = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    success();
    if (!reduce) {
      pop.value = withSequence(withSpring(1.08, { damping: 8, stiffness: 220 }), withSpring(1, { damping: 12 }));
      draw.value = withDelay(180, withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }));
    }
    const done = setTimeout(onDone, reduce ? 1100 : 1700);
    return () => clearTimeout(done);
  }, [reduce, pop, draw, onDone]);

  const circle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const tick = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LENGTH * (1 - draw.value) }));


  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(200)} style={s.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel={`${title}. Tap to continue`} />
      <View style={s.center} pointerEvents="none">
        {!reduce ? DOTS.map((a, i) => <Dot key={a} angle={a} color={DOT_COLORS[i]} delay={260} />) : null}
        <Animated.View style={[s.badge, circle]}>
          <Svg width={96} height={96} viewBox="0 0 96 96">
            <Circle cx="48" cy="48" r="46" fill={ART_TONES.mint.fg} />
            <AnimatedPath d="M28 50 L42 63 L69 34" stroke="#ffffff" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none"
              strokeDasharray={CHECK_LENGTH} animatedProps={tick} />
          </Svg>
        </Animated.View>
      </View>
      <View pointerEvents="none" style={s.textBox}>
        <Text style={s.title} accessibilityLiveRegion="polite">{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
    </Animated.View>
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
