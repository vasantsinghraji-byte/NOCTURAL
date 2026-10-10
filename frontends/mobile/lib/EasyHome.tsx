import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Clock, FlaskConical, HeartHandshake, Pill, PersonStanding, UserRound, Users, type LucideIcon } from 'lucide-react-native';
import type { CareBooking, CareService, RefillView } from '@medrush/shared';
import { api } from './api';
import { useAuth } from './auth';
import { CallMeBack } from './CallMeBack';
import { FamilyInvites } from './FamilyInvites';
import { DEMO_POINT, shortName } from './care';
import { WineGradient } from './CareArt';
import { useEasyMode } from './easyMode';
import { serviceIcon } from './icons';
import { fmtDay, fmtTime, inr } from './market';
import { PressScale, Rise, Skeleton } from './motion';
import { useTabBarSpace } from './PillTabBar';
import { useLiveLocation } from './useLiveLocation';
import { C, F, clay } from './theme';

const ACTIVE = ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const STATUS: Record<string, string> = {
  REQUESTED: 'We are finding your professional',
  ASSIGNED: 'Your professional is confirmed',
  CONFIRMED: 'Your professional is confirmed',
  EN_ROUTE: 'Your professional is on the way',
  IN_PROGRESS: 'Your visit is going on'
};
// The nursing services most people book, in this order (others are in the full app).
const TOP = ['INJECTION', 'WOUND_DRESSING', 'IV_DRIP', 'ELDERLY_CARE', 'CATHETER_CARE'];

/**
 * Easy mode Home: large type, one choice per row, no carousels or ads, who is
 * coming and when at the top, and a person to talk to always in reach.
 */
export function EasyHome() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const { session } = useAuth();
  const { setEasy } = useEasyMode();
  const live = useLiveLocation(DEMO_POINT, 'Jaipur');
  const [services, setServices] = useState<CareService[] | null>(null);
  const [visits, setVisits] = useState<CareBooking[]>([]);
  const [due, setDue] = useState<RefillView | null>(null);
  const [needsAnswer, setNeedsAnswer] = useState(false);

  useEffect(() => { api.listCareServices().then((r) => setServices(r.services)).catch(() => setServices([])); }, []);
  useFocusEffect(useCallback(() => {
    if (session?.kind !== 'patient') return;
    api.getMyCareBookings().then((r) => setVisits(r.data || r.bookings || [])).catch(() => undefined);
    api.myRefills().then((r) => setDue(r.refills.find((x) => x.dueSoon) || null)).catch(() => undefined);
    api.getMyOrders({ limit: 10 }).then((r) => setNeedsAnswer(r.orders.some((o) => o.items.some((i) => i.substitution?.status === 'PENDING')))).catch(() => undefined);
  }, [session?.kind]));

  const upcoming = visits.find((v) => ACTIVE.includes(v.status));
  const nursing = (services || []).filter((s) => s.category === 'NURSING')
    .sort((a, b) => (TOP.indexOf(a.serviceType) + 99) % 99 - (TOP.indexOf(b.serviceType) + 99) % 99)
    .slice(0, 4);
  const first = session?.name?.split(' ')[0];
  const book = (s: CareService) => {
    const p = live.point || DEMO_POINT;
    router.push({ pathname: '/book', params: { serviceType: s.serviceType, lat: String(p.lat), lng: String(p.lng), area: live.area, mode: 'SCHEDULED' } });
  };
  const pro = upcoming && typeof upcoming.serviceProvider === 'object' ? upcoming.serviceProvider.name : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 18, paddingBottom: tabSpace, gap: 14 }}>
      <Rise>
        <Text style={s.hello}>{first ? `Namaste, ${first}` : 'Namaste'}</Text>
        <Text style={s.ask}>What do you need today?</Text>
      </Rise>

      <FamilyInvites big />

      {upcoming ? (
        <PressScale onPress={() => router.push({ pathname: '/track', params: { id: upcoming._id } })} style={s.visit} accessibilityRole="button"
          accessibilityLabel={`${STATUS[upcoming.status] || 'Upcoming visit'}. ${fmtDay(String(upcoming.scheduledDate))} at ${fmtTime(upcoming.scheduledTime)}. Open to see details.`}>
          <WineGradient radius={26} />
          <Text style={s.visitStatus}>{STATUS[upcoming.status] || 'Your next visit'}</Text>
          <Text style={s.visitWhen}>{fmtDay(String(upcoming.scheduledDate).slice(0, 10))}, {fmtTime(upcoming.scheduledTime)}</Text>
          <View style={s.visitRow}>
            <UserRound size={18} color="#ffd3da" />
            <Text style={s.visitPro}>{pro ? `${pro} is coming` : 'We will tell you who is coming'}</Text>
          </View>
          <View style={s.visitBtn}><Text style={s.visitBtnText}>See Details</Text><ChevronRight size={18} color={C.brand} /></View>
        </PressScale>
      ) : null}

      {needsAnswer ? (
        <BigAction icon={Pill} title="Your pharmacy needs an answer" sub="A medicine is out of stock; they suggest the same one from another maker" onPress={() => router.push('/bookings')} />
      ) : null}

      {due ? (
        <BigAction icon={Pill} title="Your medicines are due" sub={`${due.items.map((i) => i.name).filter(Boolean).slice(0, 2).join(', ') || 'Regular medicines'}: tap to order again`}
          onPress={() => router.push({ pathname: '/pharmacy', params: { refill: due._id } })} />
      ) : null}

      <Text style={s.section}>Care at home</Text>
      {!services ? [0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={22} />) : null}
      {nursing.map((sv) => (
        <BigAction key={sv.serviceType} icon={serviceIcon(sv.serviceType)} title={shortName(sv)}
          sub={`Nurse at your home${sv.pricingPreview ? ` · ${inr(sv.pricingPreview.regular.totalAmount)}` : ''}`} onPress={() => book(sv)} />
      ))}
      <BigAction icon={PersonStanding} title="Physiotherapy" sub="Exercises at home or clinic" onPress={() => router.push('/care/PHYSIO')} />
      <BigAction icon={HeartHandshake} title="Attendant or caregiver" sub="The same person every day" onPress={() => router.push('/care/HOMECARE')} />

      <Text style={s.section}>Tests and medicines</Text>
      <BigAction icon={FlaskConical} title="Blood test at home" sub="Sample taken at home, report on your phone" onPress={() => router.push('/labs')} />
      <BigAction icon={Pill} title="Order medicines" sub="Delivered from a pharmacy near you" onPress={() => router.push('/pharmacy')} />

      <BigAction icon={Users} title="My family" sub="Help a parent, or let family help you" onPress={() => router.push('/family')} />

      <Text style={s.section}>Need help?</Text>
      <CallMeBack big topic={upcoming ? 'VISIT' : 'BOOKING'} context={upcoming ? { kind: 'VISIT', id: upcoming._id } : undefined} label="Call me, I need help" />

      <PressScale onPress={() => setEasy(false)} style={s.switch} accessibilityRole="button">
        <Clock size={16} color={C.muted} />
        <Text style={s.switchText}>Switch to the full app</Text>
      </PressScale>
    </ScrollView>
  );
}

function BigAction({ icon: Icon, title, sub, onPress }: { icon: LucideIcon; title: string; sub: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} style={s.action} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      <View style={s.actionIcon}><Icon size={28} color={C.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.actionTitle}>{title}</Text>
        <Text style={s.actionSub}>{sub}</Text>
      </View>
      <ChevronRight size={24} color={C.inkSoft} />
    </PressScale>
  );
}

const s = StyleSheet.create({
  hello: { fontFamily: F.display, fontSize: 32, color: C.ink, letterSpacing: -0.8 },
  ask: { fontFamily: F.semi, fontSize: 18, color: C.inkSoft, marginTop: 4 },
  section: { fontFamily: F.display, fontSize: 21, color: C.ink, marginTop: 10 },
  visit: { borderRadius: 26, padding: 20, overflow: 'hidden', backgroundColor: C.night, gap: 6 },
  visitStatus: { color: '#ffd3da', fontFamily: F.bold, fontSize: 16 },
  visitWhen: { color: '#ffffff', fontFamily: F.display, fontSize: 26 },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  visitPro: { color: '#ffffff', fontFamily: F.semi, fontSize: 16, flexShrink: 1 },
  visitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#ffffff', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, marginTop: 10, minHeight: 48 },
  visitBtnText: { color: C.brand, fontFamily: F.heavy, fontSize: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 24, backgroundColor: C.card, minHeight: 88, ...clay },
  actionIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontFamily: F.display, fontSize: 20, color: C.ink },
  actionSub: { fontFamily: F.medium, fontSize: 15, color: C.muted, marginTop: 2, lineHeight: 20 },
  switch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, minHeight: 52 },
  switchText: { fontFamily: F.bold, fontSize: 15, color: C.muted }
});
