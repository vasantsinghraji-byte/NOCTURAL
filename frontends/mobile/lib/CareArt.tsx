import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Animated SVG illustrations for the care marketplace (mirrors the website's
 * CareArt): a beating heart with a heartbeat line being drawn, a knee in
 * motion for physio, a home with a beating heart and a ticking clock for home
 * care, a test tube with rising bubbles for labs. Built from stacked SVG
 * layers moved with RN Animated (transforms on the native driver; only the
 * heartbeat line's dash offset runs on JS). Everything stays still when the
 * phone's "reduce motion" setting is on. Decorative: hidden from screen readers.
 */
export type ArtKind = 'heart' | 'physio' | 'homecare' | 'lab' | 'empty';

const VB = '0 0 400 400';
const HEART = 'M200 318 C 128 266 84 222 84 166 C 84 124 116 96 152 96 C 176 96 192 109 200 126 C 208 109 224 96 248 96 C 284 96 316 124 316 166 C 316 222 272 266 200 318 Z';
const SMALL_HEART = 'M200 286 C 168 262 148 244 148 220 C 148 202 162 190 178 190 C 188 190 196 196 200 204 C 204 196 212 190 222 190 C 238 190 252 202 252 220 C 252 244 232 262 200 286 Z';
const ECG_LEN = 720;
const ecgPath = (y: number) => `M20 ${y} H120 L138 ${y - 10} L150 ${y + 12} L166 ${y - 70} L184 ${y + 56} L198 ${y - 22} L210 ${y} H262 L276 ${y - 18} L290 ${y} H380`;

const AnimatedPath = Animated.createAnimatedComponent(Path);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/** A 0→1 value that loops (or sits at `still` when motion is reduced). */
function useLoop(build: (v: Animated.Value) => Animated.CompositeAnimation, reduced: boolean, still = 0) {
  const v = useRef(new Animated.Value(still)).current;
  useEffect(() => {
    if (reduced) { v.setValue(still); return undefined; }
    const loop = Animated.loop(build(v));
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  return v;
}

const linear = (v: Animated.Value, duration: number, delay = 0, native = true) => Animated.sequence([
  Animated.delay(delay),
  Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: native }),
  Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: native })
]);
const yoyo = (v: Animated.Value, duration: number, delay = 0) => Animated.sequence([
  Animated.delay(delay),
  Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
  Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
]);
/** lub-dub: two quick swells, then rest. */
const heartbeat = (v: Animated.Value) => Animated.sequence([
  Animated.timing(v, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
  Animated.timing(v, { toValue: 0.3, duration: 120, useNativeDriver: true }),
  Animated.timing(v, { toValue: 0.8, duration: 140, useNativeDriver: true }),
  Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
  Animated.delay(520)
]);

export default function CareArt({ kind = 'heart', size = 160, style }: { kind?: ArtKind; size?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const k = size / 400; // view-box units → px
  const fill = { position: 'absolute' as const, left: 0, top: 0, width: size, height: size };

  const glow = useLoop((v) => yoyo(v, 1600), reduced, 0.5);
  const ring1 = useLoop((v) => linear(v, 2400), reduced);
  const ring2 = useLoop((v) => linear(v, 2400, 1200), reduced);
  const orbit = useLoop((v) => linear(v, 18000), reduced);
  const orbitRev = useLoop((v) => linear(v, 26000), reduced);
  const beat = useLoop(heartbeat, reduced);
  const float1 = useLoop((v) => yoyo(v, 2200), reduced, 0.5);
  const float2 = useLoop((v) => yoyo(v, 2600, 400), reduced, 0.5);
  const swing = useLoop((v) => yoyo(v, 1100), reduced, 0.5);
  const ecg = useLoop((v) => Animated.sequence([
    Animated.timing(v, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    Animated.delay(900),
    Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: false })
  ]), reduced, 1);
  const bubbles = [
    useLoop((v) => linear(v, 2200), reduced),
    useLoop((v) => linear(v, 2200, 700), reduced),
    useLoop((v) => linear(v, 2200, 1400), reduced)
  ];

  const scaleOf = (v: Animated.Value, to: number) => v.interpolate({ inputRange: [0, 1], outputRange: [1, to] });
  const spin = (v: Animated.Value, dir = 1) => v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * dir}deg`] });
  const bob = (v: Animated.Value, px: number) => v.interpolate({ inputRange: [0, 1], outputRange: [px * k, -px * k] });
  const ring = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.4] }) }]
  });
  const ecgOffset = ecg.interpolate({ inputRange: [0, 1], outputRange: [ECG_LEN, 0] });
  const at = (x: number, y: number) => [x * k, y * k, 0];

  const Ecg = ({ y, color }: { y: number; color: string }) => (
    <Svg viewBox={VB} style={fill}>
      <AnimatedPath d={ecgPath(y)} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[ECG_LEN, ECG_LEN]} strokeDashoffset={ecgOffset} />
    </Svg>
  );

  const ringBox = { position: 'absolute' as const, left: 80 * k, top: 80 * k, width: 240 * k, height: 240 * k, borderRadius: 120 * k, borderWidth: 2, borderColor: 'rgba(255,141,160,0.55)' };

  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Glow, pulse rings and orbits */}
      <Animated.View style={[fill, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]}>
        <Svg viewBox={VB} style={fill}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#ff4d6a" stopOpacity={0.75} />
              <Stop offset="60%" stopColor="#c21f3d" stopOpacity={0.25} />
              <Stop offset="100%" stopColor="#c21f3d" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={200} cy={200} r={170} fill="url(#glow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[ringBox, ring(ring1)]} />
      <Animated.View style={[ringBox, ring(ring2)]} />
      <Animated.View style={[fill, { transform: [{ rotate: spin(orbit) }] }]}>
        <Svg viewBox={VB} style={fill}>
          <Circle cx={200} cy={200} r={168} fill="none" stroke="#ffffff" strokeOpacity={0.16} strokeDasharray="2 10" />
          <Circle cx={368} cy={200} r={5} fill="#ffb3c0" />
          <Circle cx={32} cy={200} r={3.5} fill="#ffffff" fillOpacity={0.7} />
        </Svg>
      </Animated.View>
      <Animated.View style={[fill, { transform: [{ rotate: spin(orbitRev, -1) }] }]}>
        <Svg viewBox={VB} style={fill}>
          <Circle cx={200} cy={44} r={4} fill="#ffffff" fillOpacity={0.8} />
          <Circle cx={200} cy={356} r={3} fill="#ff8da0" />
        </Svg>
      </Animated.View>

      {kind === 'heart' && (
        <>
          <Animated.View style={[fill, { transform: [{ scale: scaleOf(beat, 1.08) }] }]}>
            <Svg viewBox={VB} style={fill}>
              <Gradients />
              <Path d={HEART} fill="url(#red)" />
              <Path d="M150 122 C 130 124 116 140 114 160" fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={8} strokeLinecap="round" />
              <Path d={HEART} fill="none" stroke="#ffb3c0" strokeOpacity={0.5} strokeWidth={2} />
            </Svg>
          </Animated.View>
          <Ecg y={204} color="#ffffff" />
        </>
      )}

      {kind === 'physio' && (
        <>
          <Svg viewBox={VB} style={fill}>
            <Gradients />
            <Rect x={150} y={96} width={70} height={128} rx={34} fill="url(#glass)" transform="rotate(-18 185 160)" />
          </Svg>
          {/* The shin swings from the knee: range of motion */}
          <Animated.View style={[fill, { transformOrigin: at(201, 226), transform: [{ rotate: swing.interpolate({ inputRange: [0, 1], outputRange: ['-16deg', '14deg'] }) }] }]}>
            <Svg viewBox={VB} style={fill}>
              <Gradients />
              <Rect x={172} y={222} width={58} height={122} rx={29} fill="url(#glass)" />
              <Rect x={166} y={330} width={78} height={26} rx={13} fill="#ffd0d8" />
            </Svg>
          </Animated.View>
          <Animated.View style={[fill, { transformOrigin: at(201, 226), transform: [{ scale: scaleOf(beat, 1.12) }] }]}>
            <Svg viewBox={VB} style={fill}>
              <Gradients />
              <Circle cx={201} cy={226} r={30} fill="url(#red)" />
              <Circle cx={201} cy={226} r={12} fill="#ffffff" fillOpacity={0.85} />
            </Svg>
          </Animated.View>
          <Svg viewBox={VB} style={fill}>
            <Path d="M262 180 A 92 92 0 0 1 262 290" fill="none" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" strokeDasharray="10 14" />
            <Path d="M254 284 l10 10 l4 -15" fill="none" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </>
      )}

      {kind === 'homecare' && (
        <>
          <Svg viewBox={VB} style={fill}>
            <Gradients />
            <Path d="M96 196 L200 104 L304 196" fill="none" stroke="#ffffff" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M120 186 V316 a10 10 0 0 0 10 10 H270 a10 10 0 0 0 10 -10 V186" fill="url(#glass)" />
            <Circle cx={300} cy={106} r={34} fill="#ffffff" />
            <Circle cx={300} cy={106} r={34} fill="none" stroke="#d4203f" strokeWidth={4} />
            <Line x1={300} y1={106} x2={314} y2={112} stroke="#d4203f" strokeWidth={5} strokeLinecap="round" />
          </Svg>
          <Animated.View style={[fill, { transformOrigin: at(200, 238), transform: [{ scale: scaleOf(beat, 1.12) }] }]}>
            <Svg viewBox={VB} style={fill}>
              <Gradients />
              <Path d={SMALL_HEART} fill="url(#red)" />
            </Svg>
          </Animated.View>
          {/* Clock: the same caregiver, by day and time */}
          <Animated.View style={[fill, { transformOrigin: at(300, 106), transform: [{ rotate: spin(orbit, 6) }] }]}>
            <Svg viewBox={VB} style={fill}>
              <Line x1={300} y1={106} x2={300} y2={84} stroke="#7d0e24" strokeWidth={5} strokeLinecap="round" />
              <Circle cx={300} cy={106} r={4} fill="#7d0e24" />
            </Svg>
          </Animated.View>
        </>
      )}

      {kind === 'lab' && (
        <>
          <Svg viewBox={VB} style={fill}>
            <Gradients />
            <G transform="rotate(-14 200 210)">
              <Rect x={160} y={70} width={80} height={16} rx={8} fill="#ffd0d8" />
              <Path d="M168 86 V292 a32 32 0 0 0 64 0 V86 Z" fill="url(#glass)" />
              <Path d="M168 196 H232 V292 a32 32 0 0 1 -64 0 Z" fill="url(#red)" />
              <Rect x={178} y={104} width={7} height={70} rx={3.5} fill="#ffffff" fillOpacity={0.9} />
            </G>
          </Svg>
          <View style={[fill, { transformOrigin: at(200, 210), transform: [{ rotate: '-14deg' }] }]}>
            {[[190, 282, 7], [212, 290, 5], [200, 300, 4]].map(([cx, cy, r], i) => (
              <Animated.View
                key={i}
                style={[fill, {
                  opacity: bubbles[i].interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.9, 0.6, 0] }),
                  transform: [{ translateY: bubbles[i].interpolate({ inputRange: [0, 1], outputRange: [0, -95 * k] }) }]
                }]}
              >
                <Svg viewBox={VB} style={fill}><Circle cx={cx} cy={cy} r={r} fill="#ffffff" /></Svg>
              </Animated.View>
            ))}
          </View>
          <Animated.View style={[fill, { transform: [{ translateY: bob(float1, 8) }] }]}>
            <Svg viewBox={VB} style={fill}>
              <Gradients />
              <Path d="M300 230 C 300 230 278 258 278 272 a22 22 0 0 0 44 0 C 322 258 300 230 300 230 Z" fill="url(#red)" />
            </Svg>
          </Animated.View>
          <Ecg y={340} color="#ffb3c0" />
        </>
      )}

      {kind === 'empty' && (
        <>
          <Svg viewBox={VB} style={fill}>
            <Path d={HEART} fill="none" stroke="#e8a0ac" strokeWidth={6} strokeDasharray="14 12" />
          </Svg>
          <Ecg y={208} color="#c21f3d" />
        </>
      )}

      {/* Floating plus signs */}
      <Animated.View style={[fill, { transform: [{ translateY: bob(float1, 6) }] }]}>
        <Svg viewBox={VB} style={fill}>
          <G fill="#ffffff" fillOpacity={0.85}>
            <Rect x={58} y={96} width={18} height={5} rx={2.5} />
            <Rect x={64.5} y={89.5} width={5} height={18} rx={2.5} />
          </G>
          <G fill="#ffffff" fillOpacity={0.6}>
            <Rect x={320} y={84} width={12} height={3.5} rx={1.75} />
            <Rect x={324.25} y={79.75} width={3.5} height={12} rx={1.75} />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[fill, { transform: [{ translateY: bob(float2, 7) }] }]}>
        <Svg viewBox={VB} style={fill}>
          <G fill="#ffb3c0">
            <Rect x={318} y={290} width={14} height={4} rx={2} />
            <Rect x={323} y={285} width={4} height={14} rx={2} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Gradients each SVG layer needs (ids are per-<Svg> on native). */
function Gradients() {
  return (
    <Defs>
      <LinearGradient id="red" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#ff6680" />
        <Stop offset="55%" stopColor="#d4203f" />
        <Stop offset="100%" stopColor="#7d0e24" />
      </LinearGradient>
      <LinearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
        <Stop offset="100%" stopColor="#ffd9df" stopOpacity={0.8} />
      </LinearGradient>
    </Defs>
  );
}

/** Wine → crimson gradient fill for hero cards (no gradient native module needed). */
export function WineGradient({ radius = 28 }: { radius?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="wine" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#d02a4b" />
            <Stop offset="55%" stopColor="#9a1832" />
            <Stop offset="100%" stopColor="#5c0d22" />
          </LinearGradient>
          <RadialGradient id="shine" cx="85%" cy="10%" r="60%">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.18} />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#wine)" />
        <Rect x={0} y={0} width={100} height={100} fill="url(#shine)" />
      </Svg>
    </View>
  );
}
