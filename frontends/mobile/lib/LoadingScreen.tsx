import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { NabzMark } from './Brand';
import { IS_PARTNER_APP } from './variant';
import { C } from './theme';

/**
 * App start / session restore screen for both apps. Continues the native
 * splash (the same pin, centred, on the same background): the pin beats,
 * rings pulse out from it and a heartbeat line draws underneath, then the
 * wordmark fades in. Still when "reduce motion" is on.
 *
 * `fontsReady` is false while the bundled fonts are still loading (the
 * wordmark then uses the system font).
 */
const ECG = 'M4 22 H58 L66 14 L74 30 L84 2 L96 40 L104 16 L110 22 H176';
const ECG_LEN = 260;
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function LoadingScreen({ fontsReady = true, label }: { fontsReady?: boolean; label?: string }) {
  const [reduced, setReduced] = useState(false);
  const beat = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const draw = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined); }, []);
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, delay: 250, useNativeDriver: true }).start();
    if (reduced) { draw.setValue(1); return undefined; }
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0.35, duration: 120, useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0.85, duration: 140, useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.delay(480)
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true })
      ])),
      Animated.loop(Animated.sequence([
        Animated.delay(900),
        Animated.timing(ring2, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(ring2, { toValue: 0, duration: 0, useNativeDriver: true })
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(draw, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        Animated.delay(500),
        Animated.timing(draw, { toValue: 0, duration: 0, useNativeDriver: false })
      ]))
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduced, beat, ring, ring2, draw, fade]);

  const ringStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.1] }) }]
  });
  const font = fontsReady ? { fontFamily: 'Outfit_800ExtraBold' } : { fontWeight: '800' as const };

  return (
    <View style={s.screen} accessibilityRole="progressbar" accessibilityLabel={label || 'Loading Nabz'}>
      <View style={s.center}>
        <Animated.View style={[s.ring, ringStyle(ring)]} />
        <Animated.View style={[s.ring, ringStyle(ring2)]} />
        <Animated.View style={{ transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
          <NabzMark size={76} pin={C.brand} pulse="#ffffff" />
        </Animated.View>
      </View>
      <Svg width={180} height={44} viewBox="0 0 180 44" style={{ marginTop: 18 }}>
        <Path d={ECG} stroke={C.border} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <AnimatedPath d={ECG} stroke={C.brand} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={[ECG_LEN, ECG_LEN]} strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [ECG_LEN, 0] })} />
      </Svg>
      <Animated.View style={{ opacity: fade, alignItems: 'center', marginTop: 14 }}>
        <Text style={[s.word, font]}>nabz{IS_PARTNER_APP ? <Text style={s.partner}> partner</Text> : null}</Text>
        <Text style={s.tag}>{label || (IS_PARTNER_APP ? 'Your shop, your visits, your earnings' : 'Care at home, by people you choose')}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  center: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: C.brand },
  word: { fontSize: 32, color: C.ink, letterSpacing: -1 },
  partner: { color: C.brand },
  tag: { marginTop: 4, fontSize: 13, color: C.muted }
});
