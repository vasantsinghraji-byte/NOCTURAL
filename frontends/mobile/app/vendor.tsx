import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import type { PharmacyOrder } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/lib/theme';
import { notifyLocal, registerForServerPush, requestNotificationPermission } from '@/lib/notifications';

const POLL_MS = 10_000;

// What the store can do next from each status (mirrors the API's transitions).
const NEXT_ACTIONS: Record<string, Array<{ status: string; label: string; danger?: boolean }>> = {
  PLACED: [{ status: 'ACCEPTED', label: 'Accept' }, { status: 'REJECTED', label: 'Reject', danger: true }],
  ACCEPTED: [{ status: 'PREPARING', label: 'Start packing' }],
  PREPARING: [{ status: 'READY_FOR_PICKUP', label: 'Ready for pickup' }],
  READY_FOR_PICKUP: [{ status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' }],
  OUT_FOR_DELIVERY: [{ status: 'DELIVERED', label: 'Delivered' }]
};

export default function VendorOrders() {
  const { session, logout } = useAuth();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushInfo, setPushInfo] = useState<string>('Checking notifications…');
  const [busyId, setBusyId] = useState<string | null>(null);
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

  async function move(order: PharmacyOrder, status: string) {
    setBusyId(order._id);
    try {
      await api.vendorUpdateOrderStatus(order._id, status);
      await load();
    } catch (e) {
      setError(describeNetworkError(e));
    } finally {
      setBusyId(null);
    }
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
      {error && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o._id}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<Text style={styles.muted}>No orders yet. Place one from a customer account to test.</Text>}
          renderItem={({ item: o }) => (
            <View style={[styles.card, o.status === 'PLACED' && styles.cardNew]}>
              <View style={styles.row}>
                <Text style={styles.orderNo}>{o.orderNumber}</Text>
                <Text style={styles.status}>{o.status.replace(/_/g, ' ')}</Text>
              </View>
              {o.fulfilment === 'STAFF_PICKUP' && (
                <Text style={styles.pickup}>
                  Nurse pickup for home visit{o.careVisit ? ` · ${String(o.careVisit.scheduledDate).slice(0, 10)} ${o.careVisit.scheduledTime}` : ''}. Pack and hand to the nurse.
                </Text>
              )}
              {o.items.map((it, i) => (
                <Text key={i} style={styles.item}>{it.quantity} × {it.name}</Text>
              ))}
              <Text style={styles.muted}>
                ₹{o.amounts.total} · {o.paymentMode === 'COD' ? 'Cash on delivery' : `Online (${o.paymentStatus})`}
                {o.requiresPrescription ? ' · Rx required' : ''}
              </Text>
              {o.deliveryAddress && <Text style={styles.muted}>{o.deliveryAddress.line1}, {o.deliveryAddress.pincode}</Text>}
              <View style={styles.actions}>
                {(NEXT_ACTIONS[o.status] || []).map((a) => (
                  <Pressable key={a.status} disabled={busyId === o._id} onPress={() => move(o, a.status)}
                    style={[styles.action, a.danger && styles.actionDanger, busyId === o._id && { opacity: 0.5 }]}>
                    <Text style={[styles.actionText, a.danger && styles.actionTextDanger]}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
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
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 10, margin: 12, borderRadius: 10, fontFamily: F.semi },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border, gap: 4 },
  cardNew: { borderColor: C.brand, borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  orderNo: { fontFamily: F.heavy, color: C.ink },
  status: { fontFamily: F.bold, color: C.brand, fontSize: 12 },
  item: { color: C.ink, fontFamily: F.medium },
  pickup: { backgroundColor: C.violetSoft, color: C.violet, padding: 8, borderRadius: 10, fontFamily: F.bold, fontSize: 12, overflow: 'hidden' },
  muted: { color: C.muted, fontSize: 13, fontFamily: F.medium },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { backgroundColor: C.brand, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  actionDanger: { backgroundColor: C.card, borderWidth: 1, borderColor: C.rose },
  actionText: { color: C.onBrand, fontFamily: F.bold },
  actionTextDanger: { color: C.roseInk }
});
