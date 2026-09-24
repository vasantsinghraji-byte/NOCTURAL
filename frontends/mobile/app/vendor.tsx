import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import type { PharmacyOrder, PharmacyRejectionReason } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/lib/theme';
import { notifyLocal, registerForServerPush, requestNotificationPermission } from '@/lib/notifications';

const POLL_MS = 10_000;

// What the store can do next from each status (mirrors the API's transitions).
const NEXT_ACTIONS: Record<string, Array<{ status: string; label: string }>> = {
  PLACED: [{ status: 'ACCEPTED', label: 'Accept' }],
  ACCEPTED: [{ status: 'PREPARING', label: 'Start packing' }],
  PREPARING: [{ status: 'READY_FOR_PICKUP', label: 'Ready for pickup' }],
  READY_FOR_PICKUP: [{ status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' }],
  OUT_FOR_DELIVERY: [{ status: 'DELIVERED', label: 'Delivered' }]
};

// Stock/capacity reasons send the order to another store; prescription ones cancel it.
const DECLINE_REASONS: Array<{ code: PharmacyRejectionReason; label: string }> = [
  { code: 'OUT_OF_STOCK', label: 'None of it in stock' },
  { code: 'STORE_BUSY', label: 'Too busy' },
  { code: 'STORE_CLOSED', label: 'Closed now' },
  { code: 'PRESCRIPTION_INVALID', label: 'Prescription not valid' },
  { code: 'OTHER', label: 'Other' }
];
const CAN_DECLINE = ['PLACED', 'ACCEPTED', 'PREPARING'];
const CAN_EDIT_ITEMS = ['PLACED', 'ACCEPTED'];

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Countdown({ acceptBy }: { acceptBy?: string }) {
  const now = useNow();
  if (!acceptBy) return null;
  const left = Math.max(0, Math.round((new Date(acceptBy).getTime() - now) / 1000));
  const text = left > 0 ? `Accept within ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Moving to another store…';
  return <Text style={[styles.countdown, left <= 30 && { color: C.roseInk, backgroundColor: C.roseSoft }]}>{text}</Text>;
}

export default function VendorOrders() {
  const { session, logout } = useAuth();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pushInfo, setPushInfo] = useState<string>('Checking notifications…');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.vendorListOrders({ limit: 30 });
      const fresh = res.orders;
      // First load just records what exists; later loads alert on anything new.
      if (seen.current) {
        for (const o of fresh) {
          if (!seen.current.has(o._id) && o.status === 'PLACED') {
            await notifyLocal(`New order ${o.orderNumber}`,
              `${o.items.length} item(s) · ₹${o.amounts.total} · ${o.paymentMode === 'COD' ? 'Cash on delivery' : 'Paid online'}`,
              { orderId: o._id });
          }
        }
      }
      seen.current = new Set(fresh.map((o) => o._id));
      setOrders(fresh);
      setError(null);
    } catch (e) {
      setError(describeNetworkError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.role !== 'pharmacy_vendor') return undefined;
    (async () => {
      const permission = await requestNotificationPermission();
      const push = await registerForServerPush();
      setPushInfo(permission !== 'granted'
        ? 'Notifications are off. Enable them in Permissions to hear new orders.'
        : push.ok ? 'Alerts on (in-app + server push)' : `In-app alerts on · ${push.reason}`);
    })();
    load();
    const timer = setInterval(load, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [session?.role, load]);

  if (!session) return <Redirect href="/login" />;
  if (session.role !== 'pharmacy_vendor') {
    return <View style={styles.center}><Text style={styles.muted}>This screen is for pharmacy store accounts.</Text></View>;
  }

  async function run(orderId: string, action: () => Promise<unknown>, done?: string) {
    setBusyId(orderId);
    try {
      await action();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError(describeNetworkError(e));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function decline(order: PharmacyOrder, code: PharmacyRejectionReason) {
    setDeclining(null);
    const status = order.status === 'PLACED' ? 'REJECTED' : 'CANCELLED';
    // "None in stock" also zeroes these counts so the next customer isn't sent here.
    const ids = code === 'OUT_OF_STOCK'
      ? order.items.filter((it) => (it.status || 'AVAILABLE') === 'AVAILABLE').map((it) => it.medicine)
      : [];
    run(order._id, () => api.vendorUpdateOrderStatus(order._id, status, undefined, { reasonCode: code, unavailableMedicineIds: ids }),
      code === 'PRESCRIPTION_INVALID' ? 'Order cancelled and refunded.' : 'Order passed to another pharmacy.');
  }

  function markMissing(order: PharmacyOrder, medicineId: string, name: string) {
    Alert.alert('Not available?', `${name} will be removed and the customer refunded. Your stock for it is set to 0.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove item', style: 'destructive', onPress: () => run(order._id, () => api.vendorMarkItemsUnavailable(order._id, [medicineId]), `${name} removed.`) }
    ]);
  }

  function confirmStock() {
    Alert.alert('Confirm stock counts?', 'Tell Nabz your shelf matches the counts in the app. Stores with fresh counts rank higher.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Counts are right',
        onPress: async () => {
          try {
            const res = await api.vendorConfirmInventory();
            setNotice(`Confirmed ${res.confirmed} item(s).`);
          } catch (e) {
            setError(describeNetworkError(e));
          }
        }
      }
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{pushInfo}</Text>
        <Pressable onPress={() => notifyLocal('Test alert', 'If you can see and hear this, order alerts work on this phone.')}>
          <Text style={styles.link}>Test alert</Text>
        </Pressable>
        <Pressable onPress={logout}><Text style={[styles.link, { color: C.roseInk }]}>Log out</Text></Pressable>
      </View>
      <Pressable style={styles.confirmBar} onPress={confirmStock}>
        <Text style={styles.confirmText}>Confirm stock counts</Text>
      </Pressable>
      {error && <Text style={styles.error} onPress={() => setError(null)}>{error}</Text>}
      {notice && <Text style={styles.good} onPress={() => setNotice(null)}>{notice}</Text>}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o._id}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<Text style={styles.muted}>No orders yet. Place one from a customer account to test.</Text>}
          renderItem={({ item: o }) => {
            const busy = busyId === o._id;
            const editable = CAN_EDIT_ITEMS.includes(o.status);
            return (
              <View style={[styles.card, o.status === 'PLACED' && styles.cardNew]}>
                <View style={styles.row}>
                  <Text style={styles.orderNo}>{o.orderNumber}</Text>
                  <Text style={styles.status}>{o.status.replace(/_/g, ' ')}</Text>
                </View>
                {o.status === 'PLACED' && <Countdown acceptBy={o.acceptBy} />}
                {o.fulfilment === 'STAFF_PICKUP' && (
                  <Text style={styles.pickup}>
                    Nurse pickup for home visit{o.careVisit ? ` · ${String(o.careVisit.scheduledDate).slice(0, 10)} ${o.careVisit.scheduledTime}` : ''}. Pack and hand to the nurse.
                  </Text>
                )}
                {o.items.map((it, i) => {
                  const gone = it.status === 'UNAVAILABLE';
                  return (
                    <View key={i} style={styles.itemRow}>
                      <Text style={[styles.item, gone && styles.itemGone]}>{it.quantity} × {it.name}</Text>
                      {gone ? <Text style={styles.goneTag}>Removed</Text> : editable ? (
                        <Pressable hitSlop={8} disabled={busy} onPress={() => markMissing(o, it.medicine, it.name)}>
                          <Text style={styles.missingLink}>Not available</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
                <Text style={styles.muted}>
                  ₹{o.amounts.total} · {o.paymentMode === 'COD' ? 'Cash on delivery' : `Online (${o.paymentStatus})`}
                  {o.requiresPrescription ? ' · Rx required' : ''}
                </Text>
                {o.deliveryAddress && <Text style={styles.muted}>{o.deliveryAddress.line1}, {o.deliveryAddress.pincode}</Text>}

                {declining === o._id ? (
                  <View style={styles.reasons}>
                    <Text style={styles.reasonTitle}>{o.status === 'PLACED' ? 'Why reject?' : "Why can't you fulfil it?"}</Text>
                    <Text style={styles.reasonHint}>Missing just some items? Use "Not available" on those instead.</Text>
                    <View style={styles.chips}>
                      {DECLINE_REASONS.map((r) => (
                        <Pressable key={r.code} style={styles.chip} disabled={busy} onPress={() => decline(o, r.code)}>
                          <Text style={styles.chipText}>{r.label}</Text>
                        </Pressable>
                      ))}
                      <Pressable style={[styles.chip, styles.chipGhost]} onPress={() => setDeclining(null)}>
                        <Text style={[styles.chipText, { color: C.muted }]}>Back</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    {(NEXT_ACTIONS[o.status] || []).map((a) => (
                      <Pressable key={a.status} disabled={busy} onPress={() => run(o._id, () => api.vendorUpdateOrderStatus(o._id, a.status))}
                        style={[styles.action, busy && { opacity: 0.5 }]}>
                        <Text style={styles.actionText}>{a.label}</Text>
                      </Pressable>
                    ))}
                    {CAN_DECLINE.includes(o.status) && (
                      <Pressable disabled={busy} onPress={() => setDeclining(o._id)} style={[styles.action, styles.actionDanger, busy && { opacity: 0.5 }]}>
                        <Text style={[styles.actionText, styles.actionTextDanger]}>{o.status === 'PLACED' ? 'Reject' : "Can't fulfil"}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  banner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: 12, backgroundColor: C.brandSoft },
  bannerText: { flex: 1, color: C.brandDark, fontSize: 13, fontFamily: F.medium },
  link: { color: C.brand, fontFamily: F.bold },
  confirmBar: { marginHorizontal: 12, marginTop: 10, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center' },
  confirmText: { color: C.ink, fontFamily: F.bold },
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 10, margin: 12, marginBottom: 0, borderRadius: 10, fontFamily: F.semi },
  good: { backgroundColor: C.brandSoft, color: C.brandDark, padding: 10, margin: 12, marginBottom: 0, borderRadius: 10, fontFamily: F.semi },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border, gap: 4 },
  cardNew: { borderColor: C.brand, borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  orderNo: { fontFamily: F.heavy, color: C.ink },
  status: { fontFamily: F.bold, color: C.brand, fontSize: 12 },
  countdown: { alignSelf: 'flex-start', backgroundColor: C.amberSoft, color: C.amber, fontFamily: F.heavy, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  item: { flex: 1, color: C.ink, fontFamily: F.medium },
  itemGone: { color: C.muted, textDecorationLine: 'line-through' },
  goneTag: { color: C.roseInk, fontFamily: F.bold, fontSize: 12 },
  missingLink: { color: C.roseInk, fontFamily: F.bold, fontSize: 12 },
  pickup: { backgroundColor: C.violetSoft, color: C.violet, padding: 8, borderRadius: 10, fontFamily: F.bold, fontSize: 12, overflow: 'hidden' },
  muted: { color: C.muted, fontSize: 13, fontFamily: F.medium },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { backgroundColor: C.brand, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  actionDanger: { backgroundColor: C.card, borderWidth: 1, borderColor: C.rose },
  actionText: { color: C.onBrand, fontFamily: F.bold },
  actionTextDanger: { color: C.roseInk },
  reasons: { marginTop: 8, gap: 6 },
  reasonTitle: { fontFamily: F.heavy, color: C.ink },
  reasonHint: { fontFamily: F.medium, color: C.muted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.roseSoft },
  chipGhost: { backgroundColor: C.cardAlt },
  chipText: { fontFamily: F.bold, color: C.roseInk, fontSize: 13 }
});
