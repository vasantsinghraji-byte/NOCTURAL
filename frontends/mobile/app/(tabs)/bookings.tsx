import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/lib/T';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { CareBooking, OnlinePayMethod, PharmacyOrder } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inr } from '@/lib/care';
import { IconTile, serviceIcon, TONES } from '@/lib/icons';
import { Bike, CalendarDays, CalendarHeart, FileText, FlaskConical, Lock, Navigation, Star, Store, Stethoscope } from 'lucide-react-native';
import { pickAndUploadPrescription } from '@/lib/prescription';
import { C, F, PASTELS, shadow, ui } from '@/lib/theme';
import { BrandHeader } from '@/lib/BrandHeader';
import { NabzMark } from '@/lib/Brand';
import { chooseReschedule, confirmCancelVisit } from '@/lib/visitActions';
import { appAlert } from '@/lib/dialog';
import { PaymentSheet } from '@/lib/paymentSheet';
import { SubstituteCard } from '@/lib/SubstituteCard';
import { ProviderPicker } from '@/lib/providerPicker';
import { PaymentDismissedError, awaitingPayment, payOrderOnline } from '@/lib/payments';
import { ChatButton } from '@/lib/ChatButton';
import { MessagesIcon } from '@/lib/MessagesIcon';

type Tab = 'visits' | 'orders';

export default function Bookings() {
  const tabSpace = useTabBarSpace();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'orders' ? 'orders' : 'visits');
  // The live order strip opens Bookings on the medicine orders tab.
  useEffect(() => { if (params.tab === 'orders' || params.tab === 'visits') setTab(params.tab); }, [params.tab]);
  const [visits, setVisits] = useState<CareBooking[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PharmacyOrder | null>(null);
  // Change the professional for a package's remaining sessions.
  const [changing, setChanging] = useState<CareBooking | null>(null);
  const [newPro, setNewPro] = useState<string | null>(null);
  // Refill reminders: which delivered orders already have one, and the sheet to set one up.
  const [refillOrders, setRefillOrders] = useState<Set<string>>(new Set());
  const [refilling, setRefilling] = useState<string | null>(null);
  // "Upload later" prescriptions: one upload at a time (a double tap doesn't open the picker twice).
  const [rxFor, setRxFor] = useState<string | null>(null);
  const rxBusy = useRef(false);

  async function uploadPrescription(bookingId: string) {
    if (rxBusy.current) return;
    rxBusy.current = true;
    setRxFor(bookingId);
    try {
      const up = await pickAndUploadPrescription();
      if (!up) return;
      await api.attachCareBookingPrescription(bookingId, up.key);
      appAlert('Prescription uploaded', 'Your professional can see it and start the visit.');
      load();
    } catch (e) {
      appAlert('Could not upload the prescription', describeNetworkError(e));
    } finally {
      rxBusy.current = false;
      setRxFor(null);
    }
  }

  async function startRefill(everyDays: 15 | 30 | 60 | 90) {
    if (!refilling) return;
    try {
      await api.createRefill(refilling, everyDays);
      setRefilling(null);
      appAlert('Reminder set', `We’ll remind you two days before these medicines run out, every ${everyDays} days. One tap orders them again.`);
      load();
    } catch (e) { appAlert('Could not set the reminder', describeNetworkError(e)); }
  }

  async function confirmChange() {
    if (!changing?.series) return;
    try {
      const r = await api.changeCareSeriesProvider(changing.series.id, newPro);
      appAlert('Professional changed', r.moved ? `${r.moved} upcoming session(s) will go to ${newPro ? 'your chosen professional' : 'the best available professional'}.` : 'There were no upcoming sessions to move.');
      setChanging(null);
      load();
    } catch (e) {
      appAlert('Could not change', describeNetworkError(e));
    }
  }

  const load = useCallback(() => {
    if (session?.kind !== 'patient') return;
    // A fresh load clears the last failure (back online: the banner goes away).
    setError(null);
    api.getMyCareBookings().then((r) => setVisits(r.data || r.bookings || [])).catch((e) => setError(describeNetworkError(e)));
    api.getMyOrders({ limit: 20 }).then((r) => setOrders(r.orders)).catch((e) => setError(describeNetworkError(e)));
    api.myRefills().then((r) => setRefillOrders(new Set(r.refills.map((x) => String(x.fromOrder))))).catch(() => undefined);
  }, [session?.kind]);
  useFocusEffect(load);

  async function pay(order: PharmacyOrder, method: OnlinePayMethod) {
    setPaying(null);
    try {
      await payOrderOnline(order._id, method, { name: session?.name, email: session?.email });
      appAlert('Paid', `${order.orderNumber}: payment received and the pharmacy has been notified.`);
    } catch (e) {
      if (!(e instanceof PaymentDismissedError)) setError(describeNetworkError(e));
    }
    load();
  }

  const openOrder = (id: string) => router.push({ pathname: '/order/[id]', params: { id } });

  function cancel(b: CareBooking) {
    confirmCancelVisit(b._id, 'Cancelled by patient', load, setError);
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: tabSpace, gap: 12 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <BrandHeader bleed={16} style={{ paddingHorizontal: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.mark}><NabzMark size={26} pulse={C.brand} /></View>
          <Text style={styles.title}>Bookings<Text style={{ color: C.coral }}>.</Text></Text>
          <View style={{ flex: 1 }} />
          <MessagesIcon color={C.onHeader} />
        </View>
        <View style={styles.segment} accessibilityRole="tablist">
          {(['visits', 'orders'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={[styles.segBtn, tab === t && styles.segOn]}>
              <Text style={[styles.segText, tab === t && { color: C.brand }]}>{t === 'visits' ? 'Staff visits' : 'Medicine orders'}</Text>
            </Pressable>
          ))}
        </View>
      </BrandHeader>
      {session?.kind === 'patient' && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={[ui.card, styles.shortcut]} onPress={() => router.push('/care/plans')} accessibilityRole="button">
            <CalendarHeart size={20} color={C.brand} /><Text style={styles.shortcutText}>Care plans</Text>
          </Pressable>
          <Pressable style={[ui.card, styles.shortcut]} onPress={() => router.push('/labs/orders')} accessibilityRole="button">
            <FlaskConical size={20} color={C.brand} /><Text style={styles.shortcutText}>Lab tests</Text>
          </Pressable>
        </View>
      )}
      {error && <Text style={ui.error}>{error}</Text>}

      {session?.kind !== 'patient' ? (
        <View style={[ui.card, { alignItems: 'center', gap: 10 }]}>
          <IconTile icon={Lock} size={60} />
          <Text style={ui.h3}>Sign in to see your bookings</Text>
          <Pressable style={ui.btnDark} onPress={() => router.push('/welcome')}><Text style={ui.btnText}>Sign in</Text></Pressable>
        </View>
      ) : tab === 'visits' ? (
        // After a failed load, don't claim there are none: the error above says why the list is empty.
        visits.length === 0 ? (error ? null : <Empty text="No visits yet. Book a medical staff from Home." />) : visits.map((b, i) => (
          <View key={b._id} style={[styles.item, { backgroundColor: PASTELS[i % PASTELS.length] }]}>
            <IconTile icon={serviceIcon(b.serviceType)} bg={C.card} color={TONES[i % TONES.length].fg} size={50} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={ui.h3}>{b.serviceType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Text>
              <Text style={ui.muted}>{String(b.scheduledDate).slice(0, 10)} · {b.scheduledTime}</Text>
              {b.series && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Text style={[ui.muted, { fontFamily: F.bold }]}>Session {b.series.index} of {b.series.total}</Text>
                  {['REQUESTED', 'ASSIGNED', 'CONFIRMED'].includes(b.status) && (
                    <Pressable onPress={() => { setNewPro(null); setChanging(b); }} accessibilityRole="button">
                      <Text style={[styles.cancel, { color: C.brand, marginTop: 0 }]}>Change professional</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {b.status === 'REQUESTED' && b.dispatch?.status === 'NO_STAFF' && (
                <Text style={[ui.muted, { color: C.night, fontFamily: F.bold }]}>No professional was free. Pick another time.</Text>
              )}
              {b.status === 'CANCELLED' && (b.cancellation?.cancellationFee || 0) > 0 && (
                <Text style={ui.muted}>Cancellation fee {inr(b.cancellation?.cancellationFee || 0)}, added to your next booking</Text>
              )}
              {b.prescription?.status === 'PENDING' && !['COMPLETED', 'CANCELLED'].includes(b.status) && (
                <View style={styles.rxNote}>
                  <Text style={[ui.muted, { color: C.brandDark, fontFamily: F.bold }]}>Prescription needed before the visit starts</Text>
                  <Pressable style={[styles.rxBtn, rxFor === b._id && { opacity: 0.6 }]} disabled={rxFor !== null} onPress={() => uploadPrescription(b._id)}
                    accessibilityRole="button" accessibilityLabel="Upload prescription">
                    <FileText size={15} color={C.onBrand} />
                    <Text style={styles.rxBtnText}>{rxFor === b._id ? 'Uploading…' : 'Upload prescription'}</Text>
                  </Pressable>
                </View>
              )}
              {b.supplies?.status === 'ORDERED' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Store size={13} color={C.muted} /><Text style={ui.muted}>Supplies packed · {inr(b.supplies.amount || 0)}</Text></View>
              )}
              {/* Wraps on narrow phones so Cancel never runs off the card. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 10, marginTop: 4 }}>
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
                {b.serviceProvider && ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'].includes(b.status) ? <ChatButton kind="CARE" refId={b._id} compact /> : null}
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
            <View style={styles.status}><Text style={styles.statusText}>{VISIT_STATUS[b.status] || b.status.replace(/_/g, ' ')}</Text></View>
          </View>
        ))
      ) : (
        orders.length === 0 ? (error ? null : <Empty text="No medicine orders yet." />) : orders.map((o) => (
          <View key={o._id} style={{ gap: 8 }}>
            <Pressable style={[styles.item, { backgroundColor: C.card }]} onPress={() => openOrder(o._id)}
              accessibilityRole="button" accessibilityLabel={`Order ${o.orderNumber}, ${o.status.replace(/_/g, ' ').toLowerCase()}. Open details`}>
              <IconTile icon={o.fulfilment === 'STAFF_PICKUP' ? Stethoscope : Bike} size={50} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={ui.h3}>{o.orderNumber}</Text>
                {typeof o.vendor === 'object' && o.vendor?.name ? <Text style={ui.muted} numberOfLines={1}>{o.vendor.name}</Text> : null}
                <Text style={ui.muted}>{o.items.length} item(s) · {inr(o.amounts.total)}{o.amounts.discount > 0 ? ` · saved ${inr(o.amounts.discount)}${o.coupon?.code ? ` with ${o.coupon.code}` : ''}` : ''}</Text>
                {o.fulfilment === 'STAFF_PICKUP' && <Text style={ui.muted}>Brought by your nurse</Text>}
                {(() => {
                  // Why the order moved store or was cancelled (e.g. no pharmacy accepted in time).
                  const why = ['CANCELLED', 'REJECTED'].includes(o.status)
                    ? (o.cancellationReason || [...(o.timeline || [])].reverse().find((t) => t.note)?.note)
                    : [...(o.timeline || [])].reverse().find((t) => t.note && /moved to/i.test(t.note))?.note;
                  return why ? <Text style={[ui.muted, { color: ['CANCELLED', 'REJECTED'].includes(o.status) ? C.brandDark : C.inkSoft }]}>{why}</Text> : null;
                })()}
                {o.status === 'DELIVERED' && o.fulfilment !== 'STAFF_PICKUP' && (
                  refillOrders.has(o._id)
                    ? <Text style={[ui.muted, { color: C.mint, fontFamily: F.bold }]}>Refill reminder on</Text>
                    : <Pressable style={[styles.track, { alignSelf: 'flex-start', marginTop: 6 }]} onPress={() => setRefilling(o._id)} accessibilityRole="button">
                      <Text style={styles.trackText}>Remind Me to Reorder</Text>
                    </Pressable>
                )}
                {awaitingPayment(o) && (
                  <Pressable style={[styles.track, { alignSelf: 'flex-start', marginTop: 6 }]} onPress={() => setPaying(o)}>
                    <Text style={styles.trackText}>{o.paymentStatus === 'FAILED' ? 'Retry payment' : 'Pay now'}</Text>
                  </Pressable>
                )}
                {o.deliveryOtp?.code && !o.deliveryOtp.verifiedAt && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status) && (
                  <View style={styles.codeRow}>
                    <Text style={styles.codeLabel}>Delivery code</Text>
                    <Text style={styles.code}>{o.deliveryOtp.code}</Text>
                  </View>
                )}
                <Pressable style={[styles.track, { alignSelf: 'flex-start', marginTop: 6 }]} onPress={() => openOrder(o._id)} accessibilityRole="button">
                  <Navigation size={14} color={C.onNight} />
                  <Text style={styles.trackText}>{['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status) ? 'Order details' : 'Track order'}</Text>
                </Pressable>
              </View>
              <View style={styles.status}><Text style={styles.statusText}>{o.status.replace(/_/g, ' ')}</Text></View>
            </Pressable>
            {['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status) ? <ChatButton kind="PHARMACY" refId={o._id} label="Chat or Call the Pharmacy" compact /> : null}
            {o.items.filter((it) => it.substitution?.status === 'PENDING').map((it) => (
              <SubstituteCard key={String(it.medicine)} orderId={o._id} item={it} paymentMode={o.paymentMode} onAnswered={load} />
            ))}
          </View>
        ))
      )}
      <Modal visible={!!refilling} transparent animationType="slide" onRequestClose={() => setRefilling(null)}>
        <Pressable style={styles.overlay} onPress={() => setRefilling(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.title}>How often do you need these?</Text>
            <Text style={ui.muted}>We remind you two days before they run out. Nothing is ordered without you.</Text>
            {([15, 30, 60, 90] as const).map((d) => (
              <Pressable key={d} style={[styles.track, { justifyContent: 'center', paddingVertical: 14 }]} onPress={() => startRefill(d)} accessibilityRole="button">
                <Text style={[styles.trackText, { fontSize: 16 }]}>Every {d} days{d === 30 ? ' (a month)' : ''}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={!!changing} transparent animationType="slide" onRequestClose={() => setChanging(null)}>
        <Pressable style={styles.overlay} onPress={() => setChanging(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.title}>Change professional</Text>
            <Text style={ui.muted}>All upcoming sessions of this package move to who you pick. Sessions already done stay as they are.</Text>
            {changing && (
              <ProviderPicker serviceType={changing.serviceType} value={newPro} onChange={(id) => setNewPro(id)}
                allowSubstitute={false} onAllowSubstitute={() => undefined} isPackage />
            )}
            <Pressable style={[ui.btnDark, { marginTop: 8 }]} onPress={confirmChange} accessibilityRole="button">
              <Text style={ui.btnText}>Move upcoming sessions</Text>
            </Pressable>
            <Pressable onPress={() => setChanging(null)} style={{ alignItems: 'center', padding: 8 }}><Text style={ui.muted}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <PaymentSheet visible={!!paying} amount={paying?.amounts.total} online allowCash={false}
        onPick={(m) => { if (paying && m !== 'cod') pay(paying, m); }} onClose={() => setPaying(null)} />
    </ScrollView>
  );
}

function Empty({ text }: { text: string }) {
  return <View style={[ui.card, { alignItems: 'center' }]}><IconTile icon={CalendarDays} size={56} /><Text style={[ui.muted, { marginTop: 6 }]}>{text}</Text></View>;
}

/** Words for the visit status chip (the API's codes, e.g. EN_ROUTE, aren't for customers). */
const VISIT_STATUS: Record<string, string> = {
  REQUESTED: 'Requested', ASSIGNED: 'Assigned', CONFIRMED: 'Confirmed', EN_ROUTE: 'On the way',
  IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled'
};

const styles = StyleSheet.create({
  shortcut: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  shortcutText: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  title: { fontSize: 32, fontFamily: F.displayHeavy, color: C.onHeader, letterSpacing: -0.6 },
  mark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.headerGlass, borderWidth: 1, borderColor: C.headerGlassBorder },
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 34, gap: 10 },
  segment: { flexDirection: 'row', backgroundColor: C.headerGlass, borderWidth: 1, borderColor: C.headerGlassBorder, borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segOn: { backgroundColor: '#ffffff', boxShadow: '0 6px 12px -6px rgba(0,0,0,0.35)' },
  segText: { fontFamily: F.bold, color: C.onHeader, fontSize: 13 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16, ...shadow, elevation: 0 },
  status: { backgroundColor: C.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontFamily: F.heavy, color: C.ink, textTransform: 'uppercase' },
  rxNote: { gap: 8, marginTop: 6, padding: 10, borderRadius: 12, backgroundColor: C.brandSoft },
  rxBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  rxBtnText: { color: C.onBrand, fontFamily: F.bold, fontSize: 13 },
  cancel: { color: C.rose, fontFamily: F.bold, marginTop: 6 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.night, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  trackText: { color: C.onNight, fontFamily: F.heavy, fontSize: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, backgroundColor: C.card, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  codeLabel: { fontSize: 11, fontFamily: F.bold, color: C.muted },
  code: { fontSize: 17, fontFamily: F.heavy, color: C.ink, letterSpacing: 3 }
});
