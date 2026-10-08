import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, LocateFixed, MapPin, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import type { SavedAddress, SlotDay } from '@medrush/shared';
import CareArt, { WineGradient, type ArtKind } from './CareArt';
import { PressScale, Skeleton } from './motion';
import { dayShort, fmtTime, fromSaved, inr, usableAddresses, type VisitPlace } from './market';
import { C, F, IS_DARK, clay, ui } from './theme';

/**
 * Care marketplace UI kit for the apps (mirrors the website's market.css):
 * wine heroes with animated art, red pill buttons, chips, segmented controls,
 * a date strip and time grid, the bill, and the visit-address card.
 */

/** Scrollable page with room for the floating tab bar. */
export function Screen({ children, tabBar = false, header, refreshControl }: { children: ReactNode; tabBar?: boolean; header?: ReactNode; refreshControl?: React.ReactElement }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={ui.screen}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: header ? 4 : insets.top + 12, paddingBottom: tabBar ? 24 : 40 + insets.bottom, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Back arrow + title for stack screens. */
export function TopBar({ title, right }: { title?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
      <PressScale onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Back">
        <ArrowLeft size={20} color={C.ink} />
      </PressScale>
      <Text style={s.topTitle} numberOfLines={1}>{title}</Text>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** Wine hero card with animated art (the CardioLife header). */
export function MkHero({ title, accent, subtitle, art = 'heart', children, eyebrow }: {
  title: string; accent?: string; subtitle?: string; art?: ArtKind; children?: ReactNode; eyebrow?: string;
}) {
  return (
    <View style={s.hero}>
      <WineGradient />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, paddingRight: 6 }}>
          {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
          <Text style={s.heroTitle}>{title}{accent ? <Text style={{ color: '#ffd3da' }}> {accent}</Text> : null}</Text>
          {subtitle ? <Text style={s.heroSub}>{subtitle}</Text> : null}
        </View>
        <CareArt kind={art} size={128} style={{ marginRight: -14, marginVertical: -8 }} />
      </View>
      {children ? <View style={{ marginTop: 14 }}>{children}</View> : null}
    </View>
  );
}

type BtnVariant = 'primary' | 'dark' | 'ghost' | 'soft' | 'light';
/** Pill button. */
export function Btn({ label, onPress, variant = 'primary', small, disabled, loading, icon: Icon, style }: {
  label: string; onPress?: () => void; variant?: BtnVariant; small?: boolean; disabled?: boolean; loading?: boolean; icon?: LucideIcon; style?: StyleProp<ViewStyle>;
}) {
  const look: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: C.brand, fg: '#ffffff' },
    dark: { bg: C.tabBar, fg: '#ffffff' },
    ghost: { bg: 'transparent', fg: C.ink, border: C.border },
    soft: { bg: C.brandSoft, fg: C.brandDark },
    light: { bg: '#ffffff', fg: '#9a1832' }
  };
  const l = look[variant];
  const off = disabled || loading;
  return (
    <PressScale
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      style={[{
        backgroundColor: l.bg, borderRadius: 999, paddingVertical: small ? 9 : 15, paddingHorizontal: small ? 14 : 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: off ? 0.55 : 1,
        borderWidth: l.border ? 1.5 : 0, borderColor: l.border
      }, variant === 'primary' && !off ? ui.btn : null, variant === 'primary' ? { paddingVertical: small ? 9 : 15, paddingHorizontal: small ? 14 : 20 } : null, style]}
    >
      {loading ? <ActivityIndicator size="small" color={l.fg} /> : Icon ? <Icon size={small ? 15 : 17} color={l.fg} /> : null}
      <Text style={{ color: l.fg, fontFamily: F.heavy, fontSize: small ? 13 : 15 }} numberOfLines={1}>{label}</Text>
    </PressScale>
  );
}

export function Card({ children, style, selected, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; selected?: boolean; tone?: 'red' }) {
  return (
    <View style={[ui.card, tone === 'red' && { backgroundColor: C.night }, selected && { borderWidth: 2, borderColor: C.brand }, style]}>
      {tone === 'red' ? <WineGradient radius={24} /> : null}
      {children}
    </View>
  );
}

/** A card you can tap (springs), with a selected ring. */
export function TapCard({ children, onPress, selected, style, disabled, label }: { children: ReactNode; onPress?: () => void; selected?: boolean; style?: StyleProp<ViewStyle>; disabled?: boolean; label?: string }) {
  return (
    <PressScale onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }}
      style={[ui.card, { padding: 14 }, selected && { borderWidth: 2, borderColor: C.brand }, disabled && { opacity: 0.5 }, style]}>
      {children}
    </PressScale>
  );
}

export function Title({ children, size = 17, style }: { children: ReactNode; size?: number; style?: StyleProp<any> }) {
  return <Text style={[{ fontFamily: F.display, fontSize: size, color: C.ink, letterSpacing: -0.3 }, style]}>{children}</Text>;
}
export function Meta({ children, style, onDark }: { children: ReactNode; style?: StyleProp<any>; onDark?: boolean }) {
  return <Text style={[{ fontFamily: F.medium, fontSize: 13, color: onDark ? C.onNightMuted : C.muted, lineHeight: 18 }, style]}>{children}</Text>;
}
export function Section({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
      <Text style={{ flex: 1, fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: -0.4 }}>{children}</Text>
      {action}
    </View>
  );
}

export function Badge({ label, tone = 'neutral', icon: Icon }: { label: string; tone?: 'red' | 'green' | 'neutral' | 'onDark' | 'amber'; icon?: LucideIcon }) {
  const look = {
    red: { bg: C.brandSoft, fg: C.brandDark },
    green: { bg: C.mintSoft, fg: C.mint },
    amber: { bg: C.amberSoft, fg: C.amber },
    neutral: { bg: C.cardAlt, fg: C.inkSoft },
    onDark: { bg: 'rgba(255,255,255,0.16)', fg: '#ffffff' }
  }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: look.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' }}>
      {Icon ? <Icon size={12} color={look.fg} /> : null}
      <Text style={{ color: look.fg, fontFamily: F.heavy, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? C.brand : C.card, borderWidth: on ? 0 : 1, borderColor: C.border }}>
      <Text style={{ color: on ? '#ffffff' : C.inkSoft, fontFamily: F.bold, fontSize: 13 }}>{label}</Text>
    </PressScale>
  );
}
export function Chips({ children }: { children: ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }} style={{ marginHorizontal: -2, flexGrow: 0 }}>{children}</ScrollView>;
}

/** Segmented control (At Home / At Clinic …). */
export function Seg<T extends string>({ options, value, onChange, disabled }: { options: { value: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <View style={s.seg} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <Pressable key={o.value} onPress={() => !disabled && onChange(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }}
            style={[s.segBtn, on && s.segOn]}>
            {Icon ? <Icon size={14} color={on ? '#ffffff' : C.inkSoft} /> : null}
            <Text style={{ color: on ? '#ffffff' : C.inkSoft, fontFamily: F.bold, fontSize: 13 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({ value, min = 1, max = 30, onChange, disabled }: { value: number; min?: number; max?: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <View style={s.stepper}>
      <PressScale onPress={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} style={[s.stepBtn, (disabled || value <= min) && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Fewer">
        <Minus size={18} color={C.ink} />
      </PressScale>
      <Text style={{ minWidth: 40, textAlign: 'center', fontFamily: F.display, fontSize: 22, color: C.ink }} accessibilityLiveRegion="polite">{value}</Text>
      <PressScale onPress={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} style={[s.stepBtn, { backgroundColor: C.brand }, (disabled || value >= max) && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="More">
        <Plus size={18} color="#ffffff" />
      </PressScale>
    </View>
  );
}

/** Horizontal day picker: "Mon / 12 / 3 free". */
export function DateStrip({ days, value, onChange, openLabel }: { days: SlotDay[] | null; value: string; onChange: (d: string) => void; openLabel?: (n: number) => string }) {
  if (!days) return <Skeleton height={78} radius={18} />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
      {days.map((d) => {
        const on = d.date === value;
        const free = d.times.length;
        return (
          <PressScale key={d.date} onPress={() => free && onChange(d.date)} disabled={!free} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !free }}
            accessibilityLabel={`${dayShort(d.date)} ${Number(d.date.slice(8))}, ${free ? `${free} free` : 'full'}`}
            style={[s.date, on && { backgroundColor: C.brand, borderColor: C.brand }, !free && { opacity: 0.45 }]}>
            <Text style={[s.dateDay, on && { color: '#ffd3da' }]}>{dayShort(d.date)}</Text>
            <Text style={[s.dateNum, on && { color: '#ffffff' }]}>{Number(d.date.slice(8))}</Text>
            <Text style={[s.dateFree, on && { color: '#ffd3da' }]}>{free ? (openLabel ? openLabel(free) : `${free} free`) : 'Full'}</Text>
          </PressScale>
        );
      })}
    </ScrollView>
  );
}

export function TimeGrid({ times, value, onChange }: { times: string[]; value: string; onChange: (t: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {times.map((t) => {
        const on = t === value;
        return (
          <PressScale key={t} onPress={() => onChange(t)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[s.slot, on && { backgroundColor: C.tabBar, borderColor: C.tabBar }]}>
            <Text style={{ color: on ? '#ffffff' : C.ink, fontFamily: F.bold, fontSize: 13 }}>{fmtTime(t)}</Text>
          </PressScale>
        );
      })}
    </View>
  );
}

/** Bill lines with a bold total (negative lines show as discounts). */
export function Bill({ lines, total, totalLabel = 'Total' }: { lines: { label: string; amount: number | string; key?: string }[]; total: number; totalLabel?: string }) {
  return (
    <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
      {lines.map((l, i) => {
        const neg = typeof l.amount === 'number' && l.amount < 0;
        return (
          <View key={l.key || `${l.label}${i}`} style={s.billLine}>
            <Text style={[s.billLabel, neg && { color: C.mint }]}>{l.label}</Text>
            <Text style={[s.billAmt, neg && { color: C.mint }]}>{typeof l.amount === 'number' ? (neg ? `− ${inr(-l.amount)}` : inr(l.amount)) : l.amount}</Text>
          </View>
        );
      })}
      <View style={[s.billLine, { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 2 }]}>
        <Text style={{ fontFamily: F.heavy, fontSize: 16, color: C.ink }}>{totalLabel}</Text>
        <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink }}>{inr(total)}</Text>
      </View>
    </View>
  );
}

export function Note({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'green' | 'neutral' }) {
  const look = { red: { bg: C.brandSoft, fg: C.roseInk }, green: { bg: C.mintSoft, fg: IS_DARK ? C.mint : '#14704c' }, neutral: { bg: C.cardAlt, fg: C.inkSoft } }[tone];
  return (
    <View style={{ backgroundColor: look.bg, borderRadius: 16, padding: 12 }} accessibilityLiveRegion="polite">
      {typeof children === 'string' ? <Text style={{ color: look.fg, fontFamily: F.semi, fontSize: 13, lineHeight: 19 }}>{children}</Text> : children}
    </View>
  );
}

/** Empty / error state with the dashed-heart art. */
export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
      <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <CareArt kind="empty" size={130} />
      </View>
      <Text style={{ fontFamily: F.display, fontSize: 18, color: C.ink, textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.muted, textAlign: 'center', maxWidth: 300, lineHeight: 19 }}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: F.heavy, fontSize: 12, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase' }}>{children}</Text>;
}

/** Where the visit happens: saved address (sheet), current location, or add one. */
export function PlaceCard({ saved, place, onChange, onLocate, locating, signedIn }: {
  saved: SavedAddress[]; place: VisitPlace; onChange: (p: VisitPlace) => void; onLocate: () => void; locating: boolean; signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const usable = usableAddresses(saved);
  const insets = useSafeAreaInsets();
  return (
    <View style={[ui.card, { padding: 14, gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={s.tile}><MapPin size={18} color={C.brand} /></View>
        <View style={{ flex: 1 }}>
          <Label>Visit address</Label>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink, marginTop: 2 }} numberOfLines={2}>
            {place.coords ? place.label : 'Choose where the visit happens'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn small variant="ghost" icon={LocateFixed} label={locating ? 'Locating…' : 'My Location'} onPress={onLocate} disabled={locating} />
        {usable.length > 0 && <Btn small variant="soft" label="Saved Addresses" onPress={() => setOpen(true)} />}
        {signedIn && <Btn small variant="ghost" icon={Plus} label="Add" onPress={() => router.push('/addresses')} />}
      </View>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={s.grabber} />
          <Title size={20}>Choose an address</Title>
          {usable.map((a) => {
            const on = place.addressId === a._id;
            return (
              <PressScale key={a._id} onPress={() => { onChange(fromSaved(a)); setOpen(false); }} style={[s.addrRow, on && { borderColor: C.brand }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, color: C.ink, fontSize: 14 }}>{a.label || 'Address'}{a.isDefault ? '  · Default' : ''}</Text>
                  <Meta>{[a.street, a.city].filter(Boolean).join(', ')}</Meta>
                </View>
                {on ? <Check size={18} color={C.brand} /> : null}
              </PressScale>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

/** Slide-up sheet with a title. */
export function BottomSheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 20 + insets.bottom, gap: 12 }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.faint }} />
        <Title size={20}>{title}</Title>
        {children}
      </View>
    </Modal>
  );
}

export const mk = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  price: { fontFamily: F.display, fontSize: 18, color: C.ink }
});

const s = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 10, backgroundColor: C.bg },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 18, color: C.ink },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...clay },
  hero: { borderRadius: 28, padding: 20, overflow: 'hidden', backgroundColor: C.night },
  eyebrow: { alignSelf: 'flex-start', color: '#ffffff', fontFamily: F.heavy, fontSize: 11, letterSpacing: 1.2, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  heroTitle: { color: '#ffffff', fontFamily: F.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.6 },
  heroSub: { color: '#ffd3da', fontFamily: F.medium, fontSize: 13, lineHeight: 19, marginTop: 6 },
  seg: { flexDirection: 'row', backgroundColor: C.cardAlt, borderRadius: 999, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 999, minHeight: 44 },
  segOn: { backgroundColor: C.brand },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.cardAlt, borderRadius: 999, padding: 4, alignSelf: 'flex-start' },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  date: { width: 72, paddingVertical: 10, borderRadius: 20, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  dateDay: { fontFamily: F.bold, fontSize: 12, color: C.muted },
  dateNum: { fontFamily: F.display, fontSize: 22, color: C.ink, marginVertical: 1 },
  dateFree: { fontFamily: F.semi, fontSize: 10, color: C.muted },
  slot: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, minWidth: 86, alignItems: 'center' },
  billLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  billLabel: { flex: 1, fontFamily: F.medium, fontSize: 14, color: C.inkSoft },
  billAmt: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  tile: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 10 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.faint, marginBottom: 6 },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border }
});
