import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Banknote, CheckCircle2, Navigation, Package, Phone, Snowflake, Store, Wallet } from 'lucide-react-native';
import type { RiderBatch, RiderDrop, RiderEarning } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { appAlert, appPrompt } from '@/lib/dialog';
import { inr, problem } from '@/lib/market';
import { BottomSheet, Btn, Empty, Meta, Note, Title } from '@/lib/marketUI';
import { success, warn } from '@/lib/motion';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { C, F, clay, ui } from '@/lib/theme';

const HEARTBEAT_MS = 30000;
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const STEP_LABEL: Record<string, string> = { ASSIGNED: 'Go to the store', ACCEPTED: 'Go to the store', ARRIVED_AT_STORE: 'At the store', PICKED_UP: 'On the way', ARRIVED_AT_CUSTOMER: 'At the door' };

function openMaps(lat?: number, lng?: number, label?: string) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const url = Platform.OS === 'android'
    ? `google.navigation:q=${lat},${lng}`
    : `http://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(label || 'Drop')}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`));
}

/**
 * Rider home: go online, then each trip (one store, up to 3 nearby drops) in
 * order: arrive at the store, pick up, then each drop with navigation, the
 * cash to collect and the customer's code. Earnings for today and the week.
 */
export default function RiderHome() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const [online, setOnline] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [batches, setBatches] = useState<RiderBatch[] | null>(null);
  const [earn, setEarn] = useState<{ today: RiderEarning; week: RiderEarning } | null>(null);
  const [busy, setBusy] = useState('');
  const [deliver, setDeliver] = useState<RiderDrop | null>(null);
  const [code, setCode] = useState('');
  const [noCode, setNoCode] = useState('');
  const [err, setErr] = useState('');
  const beat = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    api.riderJobs().then((r) => setBatches(r.batches)).catch(() => setBatches([]));
    api.riderEarnings().then((r) => setEarn({ today: r.today, week: r.week })).catch(() => undefined);
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]));

  const here = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') throw new Error('Allow location so stores can find you');
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  };
  const stopBeat = () => { if (beat.current) clearInterval(beat.current); beat.current = null; };
  useEffect(() => stopBeat, []);

  const toggle = async (next: boolean) => {
    setSwitching(true);
    try {
      if (next) {
        await api.riderOnline(true, await here());
        stopBeat();
        beat.current = setInterval(() => { here().then((pt) => api.riderHeartbeat(pt)).catch(() => undefined); }, HEARTBEAT_MS);
      } else {
        stopBeat();
        await api.riderOnline(false);
      }
      setOnline(next);
      success();
      load();
    } catch (e) { appAlert('Couldn’t change your status', problem(e).message); } finally { setSwitching(false); }
  };

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); success(); load(); } catch (e) { warn(); appAlert('That didn’t work', problem(e).message); } finally { setBusy(''); }
  };
  const pickUpAll = (b: RiderBatch) => act(`pick:${b.store._id}`, async () => {
    for (const d of b.drops.filter((x) => ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_STORE'].includes(x.deliveryStatus))) await api.riderStep(d.orderId, 'picked-up');
  });
  const release = async (d: RiderDrop) => {
    const reason = await appPrompt({ title: 'Can’t take this order?', message: 'It goes to the next rider. Please tell us why.', placeholder: 'Bike trouble, too far…', confirmText: 'Release Order', maxLength: 200 });
    if (reason) act(d.orderId, () => api.riderRelease(d.orderId, reason));
  };
  const finish = async () => {
    if (!deliver) return;
    setErr('');
    try {
      const r = await api.riderStep(deliver.orderId, 'delivered', code.length === 4 ? { code } : { reason: noCode });
      success();
      setDeliver(null);
      setCode('');
      setNoCode('');
      appAlert('Delivered', `You earned ${inr(r.pay || 0)} for this drop.`);
      load();
    } catch (e) { setErr(problem(e).message); }
  };

  if (!session) return <Redirect href="/partner" />;
  const first = session.name.split(' ')[0];

  return (
    <View style={ui.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabSpace }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
        <View style={[s.head, { paddingTop: insets.top + 14 }]}>
          <Text style={s.hello}>{greet()},</Text>
          <Text style={s.name}>{first}</Text>
          <View style={[s.online, online && s.onlineOn]}>
            <View style={{ flex: 1 }}>
              <Text style={s.onlineTitle}>{online ? 'You’re online' : 'You’re offline'}</Text>
              <Text style={s.onlineSub}>{online ? 'Stores near you can send you orders' : 'Go online to get delivery orders'}</Text>
            </View>
            {switching ? <ActivityIndicator color="#ffffff" /> : <Switch value={online} onValueChange={toggle} trackColor={{ true: '#3dd68c', false: 'rgba(255,255,255,0.25)' }} thumbColor="#ffffff" accessibilityLabel="Online" />}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Tile icon={Wallet} label="Today" value={inr(earn?.today.earned ?? 0)} sub={`${earn?.today.drops ?? 0} drops`} />
            <Tile icon={Package} label="This week" value={inr(earn?.week.earned ?? 0)} sub={`${earn?.week.drops ?? 0} drops`} />
            <Tile icon={Banknote} label="Cash to deposit" value={inr(earn?.today.cashCollected ?? 0)} sub="today" />
          </View>
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          <Title size={20}>Your trips</Title>
          {!batches ? <ActivityIndicator color={C.brand} /> : null}
          {batches && batches.length === 0 ? <Empty title={online ? 'Waiting for orders' : 'Go online to get orders'} text="Stay near pharmacies. Orders nearby are batched so you earn more per trip." /> : null}
          {batches?.map((b) => {
            const toPick = b.drops.filter((d) => ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_STORE'].includes(d.deliveryStatus));
            return (
              <View key={String(b.store._id)} style={s.trip}>
                <View style={s.storeRow}>
                  <View style={s.icon}><Store size={20} color={C.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.storeName}>{b.store.name}</Text>
                    <Meta>{[b.store.address?.line1, b.store.address?.city].filter(Boolean).join(', ')} · {b.drops.length} drop{b.drops.length > 1 ? 's' : ''}</Meta>
                  </View>
                </View>
                {toPick.length ? (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Btn small variant="ghost" icon={Navigation} label="Navigate" onPress={() => openMaps(b.store.lat, b.store.lng, b.store.name)} />
                    {b.store.phone ? <Btn small variant="ghost" icon={Phone} label="Call Store" onPress={() => Linking.openURL(`tel:${b.store.phone}`)} /> : null}
                    {toPick.some((d) => d.deliveryStatus !== 'ARRIVED_AT_STORE')
                      ? <Btn small variant="soft" label="I’m at the Store" loading={busy === `arr:${b.store._id}`} onPress={() => act(`arr:${b.store._id}`, async () => { for (const d of toPick) if (d.deliveryStatus !== 'ARRIVED_AT_STORE') await api.riderStep(d.orderId, 'arrived-store'); })} /> : null}
                    <Btn small label={`Picked Up (${toPick.length})`} loading={busy === `pick:${b.store._id}`} onPress={() => pickUpAll(b)} />
                  </View>
                ) : null}
                {b.drops.map((d, i) => (
                  <View key={d.orderId} style={s.drop}>
                    <View style={s.dropHead}>
                      <View style={s.num}><Text style={s.numText}>{i + 1}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.dropTitle}>{d.contactName || 'Customer'} · #{d.orderNumber.slice(-6)}</Text>
                        <Meta>{[d.address.line1, d.address.line2, d.address.city].filter(Boolean).join(', ')}</Meta>
                      </View>
                      <Text style={s.pay}>{inr(d.pay)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={s.status}>{STEP_LABEL[d.deliveryStatus] || d.deliveryStatus}</Text>
                      {d.coldChain ? <View style={s.cold}><Snowflake size={12} color="#1f7fb8" /><Text style={s.coldText}>Cold chain: cooler bag, deliver within 60 min</Text></View> : null}
                      {d.collectCash > 0 ? <View style={s.cash}><Banknote size={12} color={C.amber} /><Text style={s.cashText}>Collect {inr(d.collectCash)} cash</Text></View> : null}
                    </View>
                    {['PICKED_UP', 'ARRIVED_AT_CUSTOMER'].includes(d.deliveryStatus) ? (
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <Btn small variant="ghost" icon={Navigation} label="Navigate" onPress={() => openMaps(d.lat, d.lng, d.contactName || 'Drop')} />
                        {d.contactPhone ? <Btn small variant="ghost" icon={Phone} label="Call" onPress={() => Linking.openURL(`tel:${d.contactPhone}`)} /> : null}
                        {d.deliveryStatus === 'PICKED_UP' ? <Btn small variant="soft" label="I’m Here" loading={busy === d.orderId} onPress={() => act(d.orderId, () => api.riderStep(d.orderId, 'arrived'))} /> : null}
                        <Btn small icon={CheckCircle2} label="Delivered" onPress={() => { setDeliver(d); setErr(''); }} />
                      </View>
                    ) : (
                      <Btn small variant="ghost" label="Can’t Take This" onPress={() => release(d)} style={{ alignSelf: 'flex-start' }} />
                    )}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <BottomSheet visible={Boolean(deliver)} onClose={() => setDeliver(null)} title="Hand over the order">
        {deliver?.collectCash ? <Note tone="neutral">{`Collect ${inr(deliver.collectCash)} in cash first.`}</Note> : null}
        <Text style={ui.h3}>Customer’s 4-digit delivery code</Text>
        <TextInput style={[ui.input, { fontSize: 26, letterSpacing: 12, textAlign: 'center', fontFamily: F.display }]} keyboardType="number-pad" maxLength={4} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} accessibilityLabel="Delivery code" />
        <Meta>Ask the customer to open their Nabz app. 5 tries.</Meta>
        {code.length < 4 ? (
          <TextInput style={ui.input} placeholder="No code? Say why (checked by Nabz)" placeholderTextColor={C.muted} value={noCode} onChangeText={setNoCode} maxLength={200} accessibilityLabel="Reason for no code" />
        ) : null}
        {err ? <Note>{err}</Note> : null}
        <Btn label="Mark Delivered" disabled={code.length !== 4 && noCode.trim().length < 5} onPress={finish} />
      </BottomSheet>
    </View>
  );
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub: string }) {
  return (
    <View style={s.tile}>
      <Icon size={16} color={C.gold} />
      <Text style={s.tileValue} numberOfLines={1}>{value}</Text>
      <Text style={s.tileLabel} numberOfLines={1}>{label} · {sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { backgroundColor: C.night, paddingHorizontal: 18, paddingBottom: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, gap: 14 },
  hello: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 15 },
  name: { color: '#ffffff', fontFamily: F.display, fontSize: 34, marginTop: -10 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  onlineOn: { borderColor: 'rgba(61,214,140,0.6)', backgroundColor: 'rgba(61,214,140,0.14)' },
  onlineTitle: { color: '#ffffff', fontFamily: F.bold, fontSize: 16 },
  onlineSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 13 },
  tile: { flex: 1, borderRadius: 16, padding: 12, gap: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  tileValue: { color: '#ffffff', fontFamily: F.display, fontSize: 18 },
  tileLabel: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 11 },
  trip: { backgroundColor: C.card, borderRadius: 24, padding: 14, gap: 12, ...clay },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  storeName: { fontFamily: F.display, fontSize: 18, color: C.ink },
  drop: { backgroundColor: C.cardAlt, borderRadius: 18, padding: 12, gap: 10 },
  dropHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#ffffff', fontFamily: F.heavy, fontSize: 13 },
  dropTitle: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  pay: { fontFamily: F.display, fontSize: 17, color: C.mint },
  status: { fontFamily: F.heavy, fontSize: 12, color: C.brandDark, backgroundColor: C.brandSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  cold: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e6f0f5', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  coldText: { fontFamily: F.bold, fontSize: 11, color: '#1f7fb8' },
  cash: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.amberSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  cashText: { fontFamily: F.bold, fontSize: 11, color: C.amber }
});
