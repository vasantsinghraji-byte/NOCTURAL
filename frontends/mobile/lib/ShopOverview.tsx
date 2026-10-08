import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CalendarClock, CalendarOff, ChevronRight, Clock, ListChecks, MapPin, Star, Store, type LucideIcon } from 'lucide-react-native';
import type { MyRateCardItem, MyShop } from '@medrush/shared';
import { api } from './api';
import { WineGradient } from './CareArt';
import { KINDS, inr, problem } from './market';
import { Btn } from './marketUI';
import { PressScale, Skeleton, tap } from './motion';
import { C, F, clay } from './theme';

type Tab = 'profile' | 'menu' | 'leave' | 'plans';
const open = (tab: Tab) => router.push({ pathname: '/shop', params: { tab } });

/**
 * The partner's shop at a glance, on the first screen of the partner app:
 * status, rating, live services, upcoming sessions, travel settings, a
 * "taking bookings" switch and one-tap shortcuts into My Shop.
 */
export function ShopOverview() {
  const [data, setData] = useState<{ store: MyShop | null; rateCard: MyRateCardItem[]; upcoming: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.myShop().then((r) => { setData({ store: r.store, rateCard: r.rateCard, upcoming: r.upcomingSessions || 0 }); setError(''); })
      .catch((e) => setError(problem(e).message));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error && !data) return null; // not a shop owner (e.g. no marketplace kind for this role)
  if (!data) return <Skeleton height={190} radius={24} />;

  const shop = data.store;
  if (!shop) {
    return (
      <View style={[s.card, { overflow: 'hidden' }]}>
        <WineGradient radius={24} />
        <Text style={s.kicker}>NEW · YOUR OWN SHOP</Text>
        <Text style={s.emptyTitle}>Set your prices and let customers book you directly</Text>
        <Text style={s.emptySub}>List your services, choose home or clinic, your hours and travel rate. Takes 3 minutes.</Text>
        <Btn variant="light" label="Set Up My Shop" onPress={() => router.push('/shop')} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
      </View>
    );
  }

  const live = data.rateCard.filter((i) => i.isActive && (i.home.enabled || i.clinic.enabled));
  const status = shop.status === 'APPROVED' ? (shop.isPaused ? 'Paused' : 'Live') : shop.status === 'PENDING' ? 'In review' : shop.status === 'SUSPENDED' ? 'Suspended' : 'Not approved';
  const statusTone = status === 'Live' ? { bg: C.mintSoft, fg: C.mint } : status === 'Paused' || status === 'In review' ? { bg: C.amberSoft, fg: C.amber } : { bg: C.brandSoft, fg: C.brandDark };
  const togglePause = async (taking: boolean) => {
    setBusy(true);
    try { await api.pauseShop(!taking, shop.kind); tap(); load(); } catch (e) { setError(problem(e).message); } finally { setBusy(false); }
  };

  return (
    <View style={s.card}>
      <Pressable onPress={() => open('profile')} style={s.head} accessibilityRole="button" accessibilityLabel={`${shop.name}, ${status}. Open My Shop`}>
        <View style={s.storeIcon}><Store size={20} color={C.brand} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{shop.name}</Text>
          <View style={s.inline}>
            <View style={[s.status, { backgroundColor: statusTone.bg }]}><Text style={[s.statusText, { color: statusTone.fg }]}>{status}</Text></View>
            <Text style={s.meta}>{KINDS[shop.kind].label}</Text>
            {shop.rating.count > 0 ? (
              <View style={s.inline}><Star size={12} color={C.amber} fill={C.amber} /><Text style={s.meta}>{shop.rating.avg.toFixed(1)} ({shop.rating.count})</Text></View>
            ) : null}
          </View>
        </View>
        <ChevronRight size={18} color={C.faint} />
      </Pressable>

      <View style={s.stats}>
        <Stat value={String(live.length)} label="Services live" />
        <Stat value={String(data.upcoming)} label="Upcoming" />
        <Stat value={Number.isFinite(shop.reliability?.score) ? String(shop.reliability!.score) : 'New'} label="Reliability" />
      </View>

      <Text style={s.meta}>{shop.home.enabled ? `Home visits within ${shop.home.radiusKm} km · travel ${inr(shop.home.ratePerKm)}/km` : 'Clinic visits only'} · Reliability counts being on time, finishing visits and ratings (last 60 days).</Text>

      {shop.status === 'APPROVED' ? (
        <View style={s.pauseRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.pauseTitle}>{shop.isPaused ? 'Not taking new bookings' : 'Taking new bookings'}</Text>
            <Text style={s.meta}>Booked sessions stay booked either way.</Text>
          </View>
          <Switch value={!shop.isPaused} disabled={busy} onValueChange={togglePause} trackColor={{ true: C.mint, false: C.faint }} thumbColor="#ffffff" accessibilityLabel="Taking new bookings" />
        </View>
      ) : null}

      <View style={s.actions}>
        <Action icon={ListChecks} label="Rate card" onPress={() => open('menu')} />
        <Action icon={Clock} label="Hours" onPress={() => open('profile')} />
        <Action icon={CalendarOff} label="Leave" onPress={() => open('leave')} />
        <Action icon={CalendarClock} label="Plans" onPress={() => open('plans')} />
      </View>
      {live.length === 0 ? (
        <Pressable onPress={() => open('menu')} style={s.nudge} accessibilityRole="button">
          <MapPin size={14} color={C.brandDark} />
          <Text style={s.nudgeText}>Add prices to your rate card so customers can find you.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Action({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} style={s.action} accessibilityRole="button" accessibilityLabel={label}>
      <View style={s.actionIcon}><Icon size={18} color={C.brand} /></View>
      <Text style={s.actionText} numberOfLines={1}>{label}</Text>
    </PressScale>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, gap: 14, ...clay },
  kicker: { color: '#ffd3da', fontFamily: F.heavy, fontSize: 10, letterSpacing: 1.2 },
  emptyTitle: { color: '#ffffff', fontFamily: F.display, fontSize: 20, lineHeight: 25, marginTop: 6 },
  emptySub: { color: '#ffd3da', fontFamily: F.medium, fontSize: 13, lineHeight: 19, marginTop: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.display, fontSize: 18, color: C.ink },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  status: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontFamily: F.heavy, fontSize: 11 },
  meta: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  stats: { flexDirection: 'row', backgroundColor: C.cardAlt, borderRadius: 18, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  statValue: { fontFamily: F.display, fontSize: 20, color: C.ink },
  statLabel: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  pauseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pauseTitle: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  actionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: F.bold, fontSize: 12, color: C.ink },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.brandSoft, borderRadius: 14, padding: 10 },
  nudgeText: { flex: 1, fontFamily: F.semi, fontSize: 12, color: C.brandDark }
});
