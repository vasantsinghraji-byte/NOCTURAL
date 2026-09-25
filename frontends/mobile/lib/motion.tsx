import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from './theme';

/** Light tap feedback; never throws (some devices have no vibrator). */
export const tap = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); };
export const success = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); };
export const warn = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined); };

/** Pressable that springs down slightly when touched (+ haptic tick). */
export function PressScale({ children, style, onPress, haptic = true, ...rest }: PressableProps & {
  children: ReactNode; style?: StyleProp<ViewStyle>; haptic?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      {...rest}
      onPressIn={() => to(0.97)}
      onPressOut={() => to(1)}
      onPress={(e) => { if (haptic) tap(); onPress?.(e); }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Shimmering placeholder block while content loads. */
export function Skeleton({ height = 16, width = '100%', radius = 10, style }: {
  height?: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.45, duration: 700, useNativeDriver: true })
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: C.cardAlt, opacity: v }, style]} />;
}

/** Content that rises + fades in on mount (staggered with `delay`). */
export function Rise({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Expanding radar rings: the "finding your nurse" moment. */
export function Radar({ size = 240, color = C.brand, children }: { size?: number; color?: string; children?: ReactNode }) {
  const rings = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const loops = rings.map((r, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 700),
      Animated.timing(r, { toValue: 1, duration: 2100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: true })
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {rings.map((r, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color,
          opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }]
        }} />
      ))}
      {children}
    </Animated.View>
  );
}
