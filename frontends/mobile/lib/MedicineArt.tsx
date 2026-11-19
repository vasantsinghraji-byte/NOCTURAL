import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { ART_TONES, artTone, F, R } from './theme';

/**
 * Product art for a medicine tile until real pack photos exist: a drawn pack
 * in the shape of its form (strip + carton, bottle, sachet, tube or device),
 * in its category's shelf colour, with the brand name on the label. Gives the
 * catalogue the colour and variety of a real shelf instead of one grey icon.
 */
type Shape = 'strip' | 'bottle' | 'sachet' | 'tube' | 'device';

const SHAPE_OF: Record<string, Shape> = {
  TABLET: 'strip', CAPSULE: 'strip',
  SYRUP: 'bottle', SUSPENSION: 'bottle', SOLUTION: 'bottle', LOTION: 'bottle', DROPS: 'bottle', SPRAY: 'bottle',
  POWDER: 'sachet', SACHET: 'sachet',
  CREAM: 'tube', OINTMENT: 'tube', GEL: 'tube',
  DEVICE: 'device', INHALER: 'device', INJECTION: 'device', PATCH: 'device', SUPPOSITORY: 'device', OTHER: 'device'
};

/** The word printed on the pack: the brand, i.e. the first word of the name. */
function labelFor(name: string) {
  const word = (name || '').split(/\s+/)[0] || '';
  return word.length > 8 ? word.slice(0, 7) : word;
}

function MedicineArtInner({ name, form, category, height = 76, style }: {
  name: string; form?: string; category?: string; height?: number; style?: StyleProp<ViewStyle>;
}) {
  const tone = ART_TONES[artTone(category, name)];
  const shape = SHAPE_OF[form || ''] || 'strip';
  const label = labelFor(name).toUpperCase();
  const fontSize = label.length > 6 ? 8 : 9.5;
  const text = (x: number, y: number, color: string, size = fontSize) => (
    <SvgText x={x} y={y} fill={color} fontSize={size} fontWeight="700" fontFamily={F.bold} textAnchor="middle">{label}</SvgText>
  );

  return (
    <View style={[{ height, borderRadius: R.md, overflow: 'hidden', backgroundColor: tone.bg }, style]} accessible={false}>
      <Svg width="100%" height="100%" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid meet">
        {/* Soft shelf light behind the pack */}
        <Circle cx="102" cy="10" r="30" fill={tone.fg} opacity={0.08} />
        <Circle cx="14" cy="86" r="22" fill={tone.fg} opacity={0.07} />
        <Path d="M20 80 Q60 72 100 80" stroke={tone.fg} strokeOpacity={0.12} strokeWidth={3} fill="none" strokeLinecap="round" />

        {shape === 'strip' ? (
          <G>
            {/* Carton */}
            <Rect x="42" y="12" width="50" height="62" rx="6" fill="#ffffff" stroke={tone.fg} strokeOpacity={0.25} />
            <Rect x="42" y="12" width="50" height="15" rx="6" fill={tone.fg} />
            <Rect x="42" y="22" width="50" height="5" fill={tone.fg} />
            {/* Right of centre, so the tilted strip in front never covers the brand name */}
            {text(71, 44, tone.fg, label.length > 6 ? 6.5 : label.length > 4 ? 8 : 9.5)}
            <Rect x="52" y="54" width="30" height="3" rx="1.5" fill={tone.fg} opacity={0.25} />
            <Rect x="56" y="60" width="22" height="3" rx="1.5" fill={tone.fg} opacity={0.18} />
            {/* Blister strip, tilted in front */}
            <G rotation={-14} origin="34, 60">
              <Rect x="12" y="46" width="44" height="28" rx="6" fill="#eef1f4" stroke="#cfd6dc" />
              {[0, 1, 2].map((c) => [0, 1].map((r) => (
                <Circle key={`${c}${r}`} cx={22 + c * 12} cy={54 + r * 12} r="4.2" fill="#ffffff" stroke={tone.fg} strokeOpacity={0.45} />
              )))}
            </G>
          </G>
        ) : shape === 'bottle' ? (
          <G>
            <Rect x="50" y="8" width="20" height="11" rx="3" fill={tone.fg} />
            <Rect x="53" y="18" width="14" height="8" fill={tone.fg} opacity={0.6} />
            <Rect x="40" y="25" width="40" height="56" rx="11" fill={tone.fg} opacity={0.9} />
            <Rect x="44" y="40" width="32" height="24" rx="4" fill="#ffffff" />
            {text(60, 55, tone.fg, label.length > 6 ? 7 : 8.5)}
            <Rect x="46" y="30" width="5" height="44" rx="2.5" fill="#ffffff" opacity={0.22} />
          </G>
        ) : shape === 'sachet' ? (
          <G>
            <Path d="M36 16 L42 12 L48 16 L54 12 L60 16 L66 12 L72 16 L78 12 L84 16 L84 78 L36 78 Z" fill={tone.fg} />
            <Rect x="36" y="20" width="48" height="4" fill="#ffffff" opacity={0.25} />
            <Circle cx="60" cy="49" r="17" fill="#ffffff" />
            {text(60, 52.5, tone.fg, label.length > 6 ? 6.5 : 8)}
          </G>
        ) : shape === 'tube' ? (
          <G>
            <Path d="M22 34 L84 30 Q90 30 90 36 L90 54 Q90 60 84 60 L22 56 Z" fill="#ffffff" stroke={tone.fg} strokeOpacity={0.3} />
            <Rect x="14" y="31" width="9" height="28" rx="2" fill={tone.fg} opacity={0.5} />
            <Rect x="90" y="37" width="14" height="16" rx="3" fill={tone.fg} />
            <Rect x="30" y="38" width="44" height="14" rx="3" fill={tone.fg} />
            {text(52, 48, '#ffffff', label.length > 6 ? 7 : 8.5)}
          </G>
        ) : (
          <G>
            <Rect x="38" y="10" width="44" height="70" rx="12" fill="#ffffff" stroke={tone.fg} strokeOpacity={0.3} />
            <Rect x="45" y="18" width="30" height="20" rx="4" fill={tone.bg} stroke={tone.fg} strokeOpacity={0.5} />
            <Path d="M49 30 L54 30 L57 23 L61 35 L64 28 L71 28" stroke={tone.fg} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="60" cy="54" r="7" fill={tone.fg} />
            <Rect x="48" y="66" width="24" height="4" rx="2" fill={tone.fg} opacity={0.3} />
          </G>
        )}
      </Svg>
    </View>
  );
}

export const MedicineArt = memo(MedicineArtInner);
