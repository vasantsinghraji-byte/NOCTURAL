import { View, type ViewStyle } from 'react-native';
import {
  Accessibility, Activity, Bandage, Bone, Brain, CalendarDays, Droplets, HeartPulse, Hospital,
  Package, PersonStanding, Stethoscope, Syringe, type LucideIcon
} from 'lucide-react-native';
import { C } from './theme';

/** Line icon per home-care service (SVG: no icon-font loading, crisp at any size). */
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  INJECTION: Syringe,
  IV_DRIP: Droplets,
  WOUND_DRESSING: Bandage,
  CATHETER_CARE: Activity,
  POST_SURGERY_CARE: Hospital,
  ELDERLY_CARE: Accessibility,
  PHYSIOTHERAPY_SESSION: PersonStanding,
  BACK_PAIN_THERAPY: Bone,
  KNEE_PAIN_THERAPY: Bone,
  POST_SURGERY_REHAB: HeartPulse,
  STROKE_REHAB: Brain,
  PHYSIO_PACKAGE_10: Package,
  ELDERLY_CARE_PACKAGE: CalendarDays,
  POST_SURGERY_PACKAGE: Stethoscope
};

export const serviceIcon = (type: string): LucideIcon => SERVICE_ICONS[type] || Stethoscope;

/** Icon inside a tinted rounded tile, the premium list/grid treatment. */
export function IconTile({ icon: Icon, bg = C.brandSoft, color = C.brand, size = 48, radius, style }: {
  icon: LucideIcon; bg?: string; color?: string; size?: number; radius?: number; style?: ViewStyle;
}) {
  return (
    <View style={[{
      width: size, height: size, borderRadius: radius ?? size * 0.32, backgroundColor: bg,
      alignItems: 'center', justifyContent: 'center'
    }, style]}>
      <Icon size={size * 0.5} color={color} strokeWidth={2} />
    </View>
  );
}

/** Soft tint + matching deep tone pairs for icon tiles (theme-aware). */
export const TONES: Array<{ bg: string; fg: string }> = [
  { bg: C.roseSoft, fg: C.rose },
  { bg: C.brandSoft, fg: C.brand },
  { bg: C.amberSoft, fg: C.amber },
  { bg: C.mintSoft, fg: C.mint },
  { bg: C.violetSoft, fg: C.violet }
];
