import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import type { CareBooking, PharmacyOrder } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inr } from '@/lib/care';
import { IconTile, serviceIcon, TONES } from '@/lib/icons';
import { Bike, CalendarDays, Lock, Navigation, Star, Store, Stethoscope } from 'lucide-react-native';
import { C, F, PASTELS, shadow, ui } from '@/lib/theme';
import { chooseReschedule, confirmCancelVisit } from '@/lib/visitActions';

type Tab = 'visits' | 'orders';

export default function Bookings() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>('visits');
  const [visits, setVisits] = useState<CareBooking[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (session?.kind !== 'patient') return;
    api.getMyCareBookings().then((r) => setVisits(r.data || r.bookings || [])).catch((e) => setError(describeNetworkError(e)));
    api.getMyOrders({ limit: 20 }).then((r) => setOrders(r.orders)).catch(() => undefined);
  }, [session?.kind]);
  useFocusEffect(load);

  function cancel(b: CareBooking) {
    confirmCancelVisit(b._id, 'Cancelled by patient', load, setError);
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <Text style={styles.title}>Bookings</Text>
      <View style={styles.segment}>
        {(['visits', 'orders'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.segBtn, tab === t && styles.segOn]}>
            <Text style={[styles.segText, tab === t && { color: C.onNight }]}>{t === 'visits' ? 'Staff visits' : 'Medicine orders'}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={ui.error}>{error}</Text>}

      {session?.kind !== 'patient' ? (
        <View style={[ui.card, { alignItems: 'center', gap: 10 }]}>
          <IconTile icon={Lock} size={60} />
          <Text style={ui.h3}>Sign in to see your bookings</Text>
          <Pressable style={ui.btnDark} onPress={() => router.push('/welcome')}><Text style={[ui.btnText, { color: C.onNight }]}>Sign in</Text></Pressable>
        </View>
      ) : tab === 'visits' ? (
        visits.length === 0 ? <Empty text="No visits yet. Book a medical staff from Home." /> : visits.map((b, i) => (
          <View key={b._id} style={[styles.item, { backgroundColor: PASTELS[i % PASTELS.length] }]}>
            <IconTile icon={serviceIcon(b.serviceType)} bg={C.card} color={TONES[i % TONES.length].fg} size={50} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={ui.h3}>{b.serviceType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Text>
              <Text style={ui.muted}>{String(b.scheduledDate).slice(0, 10)} · {b.scheduledTime}</Text>
              {b.status === 'REQUESTED' && b.dispatch?.status === 'NO_STAFF' && (
                <Text style={[ui.muted, { color: C.night, fontFamily: F.bold }]}>No professional was free. Pick another time.</Text>
              )}
              {b.status === 'CANCELLED' && (b.cancellation?.cancellationFee || 0) > 0 && (
                <Text style={ui.muted}>Cancellation fee {inr(b.cancellation?.cancellationFee || 0)}, added to your next booking</Text>
              )}
              {b.supplies?.status === 'ORDERED' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Store size={13} color={C.muted} /><Text style={ui.muted}>Supplies packed · {inr(b.supplies.amount || 0)}</Text></View>
              )}
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                {b.status === 'REQUESTED' && b.dispatch?.status === 'NO_STAFF' ? (
                  <Pressable style={styles.track} onPress={() => chooseReschedule(b._id, load, setError)}>
                    <CalendarDays size={14} color={C.onNight} />
                    <Text style={styles.trackText}>Reschedule</Text>
                  </Pressable>
                ) : ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'].includes(b.status) && (
                  <Pressable style={styles.track} onPress={() => router.push({ pathname: '/track', params: { id: b._id } })}>
                    <Navigation size={14} color={C.onNight} />
                    <Text style={styles.trackText}>{b.status === 'REQUESTED' ? 'Matching' : 'Track live'}</Text>
                  </Pressable>
                )}
                {b.status === 'COMPLETED' && !b.rating?.ratedAt && (
                  <Pressable style={styles.track} onPress={() => router.push({ pathname: '/track', params: { id: b._id } })}>
                    <Star size={14} color={C.gold} /><Text style={styles.trackText}>Rate visit</Text>
                  </Pressable>
                )}
                {!['COMPLETED', 'CANCELLED'].includes(b.status) && (
                  <Pressable onPress={() => cancel(b)}><Text style={styles.cancel}>Cancel</Text></Pressable>
                )}
              </View>
            </View>
            <View style={styles.status}><Text style={styles.statusText}>{b.status}</Text></View>
          </View>
        ))
      ) : (
        orders.length === 0 ? <Empty text="No medicine orders yet." /> : orders.map((o, i) => (
          <View key={o._id} style={[styles.item, { backgroundColor: PASTELS[(i + 1) % PASTELS.length] }]}>
            <IconTile icon={o.fulfilment === 'STAFF_PICKUP' ? Stethoscope : Bike} bg={C.card} color={TONES[(i + 1) % TONES.length].fg} size={50} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={ui.h3}>{o.orderNumber}</Text>
              <Text style={ui.muted}>{o.items.length} item(s) · {inr(o.amounts.total)}</Text>
              {o.fulfilment === 'STAFF_PICKUP' && <Text style={ui.muted}>Brought by your nurse</Text>}
              {o.deliveryOtp?.code && !o.deliveryOtp.verifiedAt && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status) && (
                <View style={styles.codeRow}>
                  <Text style={styles.codeLabel}>Delivery code</Text>
                  <Text style={styles.code}>{o.deliveryOtp.code}</Text>
                </View>
              )}
            </View>
            <View style={styles.status}><Text style={styles.statusText}>{o.status.replace(/_/g, ' ')}</Text></View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Empty({ text }: { text: string }) {
  return <View style={[ui.card, { alignItems: 'center' }]}><IconTile icon={CalendarDays} size={56} /><Text style={[ui.muted, { marginTop: 6 }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  title: { fontSize: 38, fontFamily: F.display, color: C.ink },
  segment: { flexDirection: 'row', backgroundColor: C.cardAlt, borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segOn: { backgroundColor: C.night },
  segText: { fontFamily: F.bold, color: C.muted, fontSize: 13 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16, ...shadow, elevation: 0 },
  status: { backgroundColor: C.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontFamily: F.heavy, color: C.ink },
  cancel: { color: C.rose, fontFamily: F.bold, marginTop: 6 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.night, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  trackText: { color: C.onNight, fontFamily: F.heavy, fontSize: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, backgroundColor: C.card, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  codeLabel: { fontSize: 11, fontFamily: F.bold, color: C.muted },
  code: { fontSize: 17, fontFamily: F.heavy, color: C.ink, letterSpacing: 3 }
});
