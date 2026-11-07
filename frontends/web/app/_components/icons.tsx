import {
  Accessibility, Activity, Bandage, Bone, Brain, CalendarDays, Droplets, HeartPulse, Hospital,
  Package, PersonStanding, Stethoscope, Syringe, type LucideIcon
} from 'lucide-react';

/** Line icon per home-care service (mirrors frontends/mobile/lib/icons.tsx). */
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

export const TONES = [
  { bg: '#fbe5e8', fg: '#d9485f' },
  { bg: '#e3f1e8', fg: '#2f7d5b' },
  { bg: '#fbf0dc', fg: '#b7791f' },
  { bg: '#e6f0f5', fg: '#3f7fa8' },
  { bg: '#f3e9f5', fg: '#8a5a9e' }
];

/** Icon inside a tinted rounded tile, the premium list/grid treatment. */
export function IconTile({ icon: Icon, bg = 'var(--brand-soft)', color = 'var(--brand)', size = 48, round = false }: {
  icon: LucideIcon; bg?: string; color?: string; size?: number; round?: boolean;
}) {
  return (
    <span style={{
      width: size, height: size, borderRadius: round ? '50%' : size * 0.32, background: bg, color,
      display: 'inline-grid', placeItems: 'center', flex: 'none'
    }}>
      <Icon size={size * 0.5} strokeWidth={2} />
    </span>
  );
}
