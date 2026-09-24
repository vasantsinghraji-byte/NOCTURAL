import Svg, { Circle, Path } from 'react-native-svg';
import { Text, View } from 'react-native';
import { C, F } from './theme';

/** Nabz mark: location pin carrying a pulse line, coral live dot. */
export function NabzMark({ size = 40, pin = '#ffffff', pulse = '#b83a50' }: { size?: number; pin?: string; pulse?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M32 4C19 4 9 13.6 9 26.2 9 41 25.4 53.3 32 60c6.6-6.7 23-19 23-33.8C55 13.6 45 4 32 4z" fill={pin} />
      <Path d="M17 28h7.5l3.5-7.5 5.5 17 3.6-9.8 2.2 3.3h5" stroke={pulse} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={46.5} cy={31} r={3.4} fill="#ff5a3c" />
    </Svg>
  );
}

export function Wordmark({ color = C.onNight, size = 26, suffix }: { color?: string; size?: number; suffix?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <NabzMark size={size + 6} />
      <Text style={{ fontFamily: F.heavy, fontSize: size, color, letterSpacing: -0.8 }}>nabz</Text>
      {suffix ? <Text style={{ fontFamily: F.displayItalic, fontSize: size * 0.8, color: C.gold }}>{suffix}</Text> : null}
    </View>
  );
}
