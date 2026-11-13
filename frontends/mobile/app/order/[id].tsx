import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Bike, CheckCircle2, Clock, MapPin, Minus, Phone, Plus, Store, Undo2 } from 'lucide-react-native';
import type { PharmacyOrder, PharmacyVendor, StorefrontItem } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { fmtStamp, inr, problem } from '@/lib/market';
import { Badge, Bill, BottomSheet, Btn, Card, Empty, Meta, Note, Screen, Title, TopBar, mk } from '@/lib/marketUI';
import { Skeleton } from '@/lib/motion';
import { useSecureView } from '@/lib/secureView';
import { ChatButton } from '@/lib/ChatButton';
import { SubstituteCard } from '@/lib/SubstituteCard';
import { OrderPrescription } from '@/lib/PrescriptionView';
import { pickAndUploadPrescription, type UploadedPrescription } from '@/lib/prescription';
import { useActiveOrder } from '@/lib/activeOrder';
import { C, F, R } from '@/lib/theme';

const POLL_MS = 10_000;
const FINISHED = ['DELIVERED', 'CANCELLED', 'REJECTED'];
const STEPS: Array<{ status: string; label: string }> = [
  { status: 'PLACED', label: 'Order placed' },
  { status: 'ACCEPTED', label: 'Pharmacy accepted' },
  { status: 'PREPARING', label: 'Packing your medicines' },
  { status: 'READY_FOR_PICKUP', label: 'Packed, waiting for the rider' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { status: 'DELIVERED', label: 'Delivered' }
];
const STATUS_LABEL: Record<string, string> = {
  PLACED: 'Waiting for the pharmacy', ACCEPTED: 'Accepted', PREPARING: 'Packing', READY_FOR_PICKUP: 'Packed',
  OUT_FOR_DELIVERY: 'On the way', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', REJECTED: 'Cancelled'
};

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** One medicine order: live progress, store and rider, door code, bill, prescription, and 90 s to change it. */
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh: refreshStrip } = useActiveOrder();
  const [order, setOrder] = useState<PharmacyOrder | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState(false);
  const now = useNow();

  const load = useCallback(() => api.getOrder(String(id)).then((r) => { setOrder(r.order); setError(''); }).catch((e) => setError(problem(e).message)), [id]);
  useEffect(() => { load(); }, [load]);
  // Live until it's delivered or cancelled.
  const live = !!order && !FINISHED.includes(order.status);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { if (AppState.currentState === 'active') load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  // The door code is a secret: no screenshots while it shows.
  const showCode = !!order?.deliveryOtp?.code && !order.deliveryOtp.verifiedAt && live;
  useSecureView('order-code', showCode);

  if (error && !order) return <View style={{ flex: 1, backgroundColor: C.bg }}><TopBar title="Medicine order" /><Empty title={error} action={<Btn variant="ghost" label="Retry" onPress={load} />} /></View>;
  if (!order) return <View style={{ flex: 1, backgroundColor: C.bg }}><TopBar title="Medicine order" /><View style={{ padding: 16, gap: 12 }}><Skeleton height={180} radius={24} /><Skeleton height={240} radius={24} /></View></View>;

  const vendor = (typeof order.vendor === 'object' ? order.vendor : null) as (PharmacyVendor & { contactPhone?: string }) | null;
  const cancelled = ['CANCELLED', 'REJECTED'].includes(order.status);
  const reached = STEPS.findIndex((s) => s.status === order.status);
  const windowEnds = order.changeWindowEndsAt ? new Date(order.changeWindowEndsAt).getTime() : 0;
  const secondsLeft = Math.max(0, Math.ceil((windowEnds - now) / 1000));
  const beforePacking = ['PLACED', 'ACCEPTED'].includes(order.status);
  const inWindow = secondsLeft > 0 && beforePacking;
  const canAdd = inWindow && order.paymentMode === 'COD' && order.fulfilment !== 'STAFF_PICKUP';
  const why = cancelled ? (order.cancellationReason || [...(order.timeline || [])].reverse().find((t) => t.note)?.note) : null;
  const etaMin = order.eta ? Math.max(order.eta.prepMinutes || 0, order.eta.assignmentMinutes || 0) + (order.eta.lastMileMinutes || 0) : null;

  const cancel = () => appAlert('Cancel this order?', order.paymentMode === 'PREPAID' && order.paymentStatus === 'PAID' ? 'Your payment is refunded to the same account.' : 'The pharmacy is told straight away.', [
    { text: 'Keep order', style: 'cancel' },
    {
      text: 'Cancel order', style: 'destructive', onPress: async () => {
        setBusy('cancel');
        try { const r = await api.cancelOrder(order._id, 'Cancelled by customer'); setOrder({ ...order, ...r.order, vendor: order.vendor }); refreshStrip(); } catch (e) { appAlert('Couldn’t cancel', problem(e).message); } finally { setBusy(''); }
      }
    }
  ]);

  return (
    <Screen header={<TopBar title={order.orderNumber} />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      {cancelled ? <Note>{why ? `Cancelled: ${why}` : 'This order was cancelled.'}{order.paymentStatus === 'REFUND_PENDING' || order.paymentStatus === 'REFUNDED' ? ' Your refund is on its way.' : ''}</Note> : null}

      {/* 90 seconds to change your mind */}
      {inWindow ? (
        <Card tone="red" style={{ gap: 10 }}>
          <View style={mk.row}>
            <Undo2 size={18} color={C.onNight} />
            <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 16, color: C.onNight }}>Forgot something or changed your mind?</Text>
            <Text style={styles.timer} accessibilityLabel={`${secondsLeft} seconds left`}>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</Text>
          </View>
          <Meta onDark>{canAdd ? 'Add items or cancel for free in the next few seconds.' : 'You can cancel for free in the next few seconds.'}</Meta>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {canAdd ? <Btn small variant="light" icon={Plus} label="Add items" onPress={() => setAdding(true)} style={{ flex: 1 }} /> : null}
            <Btn small variant="ghost" label={busy === 'cancel' ? 'Cancelling…' : 'Cancel order'} loading={busy === 'cancel'} onPress={cancel} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: 14 }}>
        <View style={[mk.row, { alignItems: 'flex-start' }]}>
          <View style={mk.tile}><Store size={22} color={C.brand} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <Title size={19}>{vendor?.name || 'Your pharmacy'}</Title>
            {vendor?.address?.line1 ? <Meta>{vendor.address.line1}</Meta> : null}
            {live && etaMin ? <View style={mk.row}><Clock size={13} color={C.muted} /><Meta>Usually arrives about {etaMin} min after the store accepts</Meta></View> : null}
          </View>
          <Badge tone={order.status === 'DELIVERED' ? 'green' : cancelled ? 'red' : 'neutral'} label={STATUS_LABEL[order.status] || order.status} />
        </View>
        {!cancelled ? (
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {vendor?.contactPhone ? <Btn small variant="soft" icon={Phone} label="Call store" onPress={() => Linking.openURL(`tel:${vendor.contactPhone}`)} /> : null}
            {!beforePacking || order.status === 'ACCEPTED' ? <ChatButton kind="PHARMACY" refId={order._id} label="Chat with store" compact /> : null}
          </View>
        ) : null}
      </Card>

      {/* Who is bringing it */}
      {!cancelled && order.fulfilment !== 'STAFF_PICKUP' ? (
        <Card style={{ gap: 10 }}>
          <View style={mk.row}>
            <View style={mk.tile}><Bike size={22} color={C.brand} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              {order.riderContact ? (
                <>
                  <Title size={17}>{order.riderContact.name}</Title>
                  <Meta>{order.status === 'DELIVERED' ? 'Delivered your order' : order.status === 'OUT_FOR_DELIVERY' ? 'On the way to you' : 'Your delivery partner, heading to the store'}</Meta>
                  {order.riderContact.phone ? <Meta>{order.riderContact.phone}</Meta> : null}
                </>
              ) : (
                <>
                  <Title size={17}>Delivery partner</Title>
                  <Meta>{order.status === 'PLACED' ? 'Assigned once the pharmacy accepts.' : 'Being assigned. You’ll see their name and number here.'}</Meta>
                </>
              )}
            </View>
          </View>
          {order.riderContact?.phone ? <Btn small icon={Phone} label={`Call ${order.riderContact.name.split(' ')[0]}`} onPress={() => Linking.openURL(`tel:${order.riderContact!.phone}`)} /> : null}
        </Card>
      ) : null}

      {showCode ? (
        <Card tone="red" style={{ gap: 10 }}>
          <Text style={{ fontFamily: F.display, fontSize: 17, color: C.onNight }}>Delivery code</Text>
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel={`Delivery code ${order.deliveryOtp!.code!.split('').join(' ')}`}>
            {order.deliveryOtp!.code!.split('').map((c, i) => (
              <View key={i} style={styles.codeBox}><Text style={styles.codeDigit}>{c}</Text></View>
            ))}
          </View>
          <Meta onDark>Tell it to the rider only when you have your medicines.</Meta>
        </Card>
      ) : null}

      {order.items.filter((it) => it.substitution?.status === 'PENDING').map((it) => (
        <SubstituteCard key={String(it.medicine)} orderId={order._id} item={it} paymentMode={order.paymentMode} onAnswered={load} />
      ))}

      {!cancelled ? (
        <Card style={{ gap: 12 }}>
          <Title size={18}>Progress</Title>
          {STEPS.map((s, i) => {
            const at = (order.timeline || []).find((t) => t.status === s.status);
            const on = i <= reached;
            return (
              <View key={s.status} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.dot, { backgroundColor: on ? C.brand : C.cardAlt }]}>
                    {on ? <CheckCircle2 size={15} color="#ffffff" /> : <Text style={{ color: C.muted, fontFamily: F.heavy, fontSize: 12 }}>{i + 1}</Text>}
                  </View>
                  {i < STEPS.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: i < reached ? C.brand : C.border }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 8 }}>
                  <Text style={{ fontFamily: F.bold, color: on ? C.ink : C.muted }}>{s.label}</Text>
                  {at ? <Meta>{fmtStamp(at.at)}</Meta> : null}
                </View>
              </View>
            );
          })}
          {(order.timeline || []).filter((t) => t.note && !/^Rider assigned/.test(t.note)).slice(-3).map((t, i) => <Meta key={i}>• {t.note}</Meta>)}
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <Title size={18}>Items</Title>
        <Bill
          lines={[
            ...order.items.map((i) => ({ label: `${i.name} × ${i.quantity}${i.status === 'UNAVAILABLE' ? ' (not available)' : ''}`, amount: i.status === 'UNAVAILABLE' ? 0 : i.lineTotal })),
            { label: 'Delivery', amount: order.amounts.deliveryFee ? order.amounts.deliveryFee : 'Free' },
            ...(order.amounts.discount > 0 ? [{ label: order.coupon?.code ? `Coupon ${order.coupon.code}` : 'Discount', amount: -order.amounts.discount }] : [])
          ]}
          total={order.amounts.total}
          totalLabel={order.paymentMode === 'COD' ? 'Pay on delivery' : order.paymentStatus === 'PAID' ? 'Paid' : 'To pay'}
        />
        <Meta>{order.paymentMode === 'COD' ? 'Cash or UPI to the rider' : `Paid online${order.paymentStatus === 'PAID' ? '' : ` (${order.paymentStatus.toLowerCase().replace('_', ' ')})`}`}</Meta>
      </Card>

      {order.deliveryAddress ? (
        <Card style={{ gap: 6 }}>
          <View style={mk.row}><MapPin size={16} color={C.brand} /><Title size={16}>Deliver to</Title></View>
          {order.deliveryAddress.contactName ? <Meta>{order.deliveryAddress.contactName}{order.deliveryAddress.contactPhone ? ` · ${order.deliveryAddress.contactPhone}` : ''}</Meta> : null}
          <Meta>{order.deliveryAddress.line1}, {order.deliveryAddress.pincode}</Meta>
        </Card>
      ) : null}

      {order.prescription?.key ? (
        <Card style={{ gap: 10 }}>
          <Title size={16}>Your prescription</Title>
          {order.prescription.verified ? <Meta style={{ color: C.mint }}>Checked by the pharmacist</Meta> : <Meta>The pharmacist checks it before packing.</Meta>}
          <OrderPrescription orderId={order._id} as="patient" height={200} />
        </Card>
      ) : null}

      {!inWindow && beforePacking ? (
        <Btn variant="ghost" label={busy === 'cancel' ? 'Cancelling…' : 'Cancel order'} loading={busy === 'cancel'} onPress={cancel} />
      ) : null}

      {adding && vendor ? (
        <AddItemsSheet order={order} vendorId={vendor._id} secondsLeft={secondsLeft} onClose={() => setAdding(false)}
          onAdded={(o) => { setOrder({ ...o, vendor: order.vendor }); setAdding(false); appAlert('Added to your order', `New total ${inr(o.amounts.total)}. The pharmacy has been told.`); }} />
      ) : null}
    </Screen>
  );
}

/** Pick extra medicines from the same store while the window is open. */
function AddItemsSheet({ order, vendorId, secondsLeft, onClose, onAdded }: {
  order: PharmacyOrder; vendorId: string; secondsLeft: number; onClose: () => void; onAdded: (o: PharmacyOrder) => void;
}) {
  const [items, setItems] = useState<StorefrontItem[] | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [rx, setRx] = useState<UploadedPrescription | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.getVendorStorefront(vendorId).then((r) => setItems(r.items.filter((i) => i.inStock))).catch((e) => setErr(problem(e).message)); }, [vendorId]);

  const picked = useMemo(() => (items || []).filter((i) => cart[i.medicine._id]), [items, cart]);
  const extra = picked.reduce((sum, i) => sum + i.sellingPrice * cart[i.medicine._id], 0);
  const needsRx = picked.some((i) => i.medicine.requiresPrescription) && !order.prescription?.key;
  const step = (id: string, d: number) => setCart((c) => { const n = { ...c }; const q = (n[id] || 0) + d; if (q <= 0) delete n[id]; else n[id] = Math.min(q, 20); return n; });

  const submit = async () => {
    if (needsRx && !rx) { setErr('Attach the prescription for the Rx medicine first.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await api.addOrderItems(order._id, picked.map((i) => ({ medicineId: i.medicine._id, quantity: cart[i.medicine._id] })), rx?.key);
      onAdded(r.order);
    } catch (e) { setErr(problem(e).message); } finally { setSaving(false); }
  };

  return (
    <BottomSheet visible onClose={onClose} title={secondsLeft > 0 ? `Add items · ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} left` : 'Time’s up'}>
      {!items ? <ActivityIndicator color={C.brand} style={{ padding: 24 }} /> : (
        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
          {items.map((it) => {
            const q = cart[it.medicine._id] || 0;
            return (
              <View key={it.inventoryId} style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName} numberOfLines={2}>{it.medicine.name}{it.medicine.requiresPrescription ? '  ·  Rx' : ''}</Text>
                  <Meta>{inr(it.sellingPrice)} · {it.medicine.packSize || it.medicine.form}</Meta>
                </View>
                {q ? (
                  <View style={styles.stepper}>
                    <Pressable onPress={() => step(it.medicine._id, -1)} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`Remove one ${it.medicine.name}`}><Minus size={16} color={C.onBrand} /></Pressable>
                    <Text style={styles.stepQty}>{q}</Text>
                    <Pressable onPress={() => step(it.medicine._id, 1)} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`Add one more ${it.medicine.name}`}><Plus size={16} color={C.onBrand} /></Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => step(it.medicine._id, 1)} style={styles.addBtn} accessibilityRole="button" accessibilityLabel={`Add ${it.medicine.name}`}><Text style={styles.addText}>ADD</Text></Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
      {needsRx ? (
        <Pressable style={styles.rxRow} onPress={async () => { const up = await pickAndUploadPrescription(); if (up) setRx(up); }} accessibilityRole="button">
          <Text style={[styles.lineName, { flex: 1 }]}>{rx ? 'Prescription attached' : 'Prescription needed for Rx items'}</Text>
          <Text style={{ color: C.brand, fontFamily: F.bold }}>{rx ? 'Change' : 'Attach'}</Text>
        </Pressable>
      ) : null}
      {err ? <Note>{err}</Note> : null}
      <Btn label={saving ? 'Adding…' : picked.length ? `Add ${inr(extra)} to order` : 'Pick items to add'} loading={saving} disabled={!picked.length || secondsLeft <= 0} onPress={submit} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  timer: { fontFamily: F.heavy, fontSize: 18, color: C.onNight, fontVariant: ['tabular-nums'] },
  codeBox: { width: 48, height: 56, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  codeDigit: { color: C.ink, fontFamily: F.display, fontSize: 26 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  lineName: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  addBtn: { minWidth: 72, minHeight: 36, borderRadius: R.sm, borderWidth: 1.5, borderColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  addText: { color: C.brand, fontFamily: F.heavy, fontSize: 13, letterSpacing: 0.6 },
  stepper: { flexDirection: 'row', alignItems: 'center', minHeight: 36, borderRadius: R.sm, backgroundColor: C.brand },
  stepBtn: { width: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  stepQty: { color: C.onBrand, fontFamily: F.bold, fontSize: 14, minWidth: 18, textAlign: 'center' },
  rxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.card }
});
