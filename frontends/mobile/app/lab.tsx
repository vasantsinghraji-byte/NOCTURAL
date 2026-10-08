import { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ban, Building2, FlaskConical, Home, LogOut, Microscope, Store, Truck, Upload } from 'lucide-react-native';
import type { LabOrderForLab, SlotDay } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { appAlert, appPrompt } from '@/lib/dialog';
import { LAB_STATUS_LABEL, fmtDay, fmtStamp, fmtTime, inr, problem, todayIst } from '@/lib/market';
import { Badge, BottomSheet, Btn, Card, DateStrip, Empty, Meta, MkHero, Note, Seg, Title, mk } from '@/lib/marketUI';
import { PressScale, Skeleton, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const week = (): SlotDay[] => [-1, 0, 1, 2, 3, 4, 5].map((n) => ({ date: new Date(new Date(`${todayIst()}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10), times: ['x'] }));

/** Path-lab partner desk (mirrors the website's /lab): the day's collections, sample steps, reports. */
export default function LabDesk() {
  const { session, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(todayIst());
  const [orders, setOrders] = useState<LabOrderForLab[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [collecting, setCollecting] = useState<LabOrderForLab | null>(null);

  const load = useCallback(() => api.labPartnerOrders({ date }).then((r) => { setOrders(r.orders); setError(''); }).catch((e) => { setError(problem(e).message); setOrders([]); }), [date]);
  useEffect(() => { if (session) load(); }, [load, session]);
  if (!session) return <Redirect href="/login" />;

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); success(); await load(); } catch (e) { appAlert('That didn’t work', problem(e).message); } finally { setBusy(''); }
  };
  const reject = async (o: LabOrderForLab) => {
    const reason = await appPrompt({ title: 'Why can’t the sample be tested?', placeholder: 'Sample clotted, not enough blood…', confirmText: 'Reject Sample', maxLength: 200 });
    if (reason && reason.trim().length >= 3) act(o._id, () => api.labReject(o._id, reason.trim()));
  };
  const upload = (o: LabOrderForLab) => appAlert('Upload report', 'Photograph the signed report or pick it from your gallery. PDF reports can be uploaded from the Nabz website.', [
    { text: 'Camera', onPress: () => pick(o, 'camera') },
    { text: 'Gallery', onPress: () => pick(o, 'gallery') },
    { text: 'Cancel', style: 'cancel' }
  ]);
  const pick = async (o: LabOrderForLab, source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { appAlert('Camera permission needed', 'Allow the camera to photograph reports.', [{ text: 'Open Settings', onPress: () => Linking.openSettings() }, { text: 'OK', style: 'cancel' }]); return; }
      }
      const r = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, exif: false });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const type = a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const name = `report-${o._id}.${type === 'image/png' ? 'png' : 'jpg'}`;
      act(o._id, () => api.uploadLabReport(o._id, { uri: a.uri, name, type }, name));
    } catch (e) { appAlert('Couldn’t open the camera', problem(e).message); }
  };

  const counts = (orders || []).reduce<Record<string, number>>((m, o) => ({ ...m, [o.status]: (m[o.status] || 0) + 1 }), {});
  return (
    <View style={ui.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40 + insets.bottom, gap: 14 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
        <MkHero eyebrow="PATH LAB PARTNER" title="Lab desk"
          subtitle={orders ? `${orders.length} booking${orders.length === 1 ? '' : 's'} on ${fmtDay(date)}. ${counts.SCHEDULED || 0} to collect, ${(counts.COLLECTED || 0) + (counts.AT_LAB || 0) + (counts.PROCESSING || 0)} in progress.` : 'Loading today…'}
          art="lab">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small variant="light" icon={Store} label="Tests & Prices" onPress={() => router.push({ pathname: '/shop', params: { kind: 'LAB' } })} />
            <Btn small variant="dark" icon={LogOut} label="Log Out" onPress={logout} />
          </View>
        </MkHero>
        <DateStrip days={week()} value={date} onChange={setDate} openLabel={() => ''} />
        {error ? <Note>{error}</Note> : null}
        {!orders ? [0, 1].map((i) => <Skeleton key={i} height={140} radius={24} />) : null}
        {orders && orders.length === 0 && !error ? <Empty title="No bookings this day" text="New lab bookings show up here with the collection time and address." /> : null}
        {(orders || []).map((o) => (
          <Card key={o._id} style={{ gap: 10 }}>
            <View style={[mk.row, { alignItems: 'flex-start' }]}>
              <View style={mk.tile}>{o.mode === 'HOME' ? <Home size={20} color={C.brand} /> : <Building2 size={20} color={C.brand} />}</View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{fmtTime(o.slot.time)} · {o.patientDetails?.name || 'Customer'}</Text>
                <Meta>{o.items.map((i) => i.name).join(', ')}</Meta>
                <Meta>{o.mode === 'HOME' ? `Home collection${o.address?.city ? `, ${o.address.street}, ${o.address.city}` : ''}` : 'Walk-in'} · {o.payment.status === 'PAID' ? 'Paid' : `Collect ${inr(o.payment.amount)}`}</Meta>
              </View>
              <Badge tone={o.status === 'REPORT_READY' ? 'green' : o.status === 'SAMPLE_REJECTED' ? 'red' : 'neutral'} label={LAB_STATUS_LABEL[o.status]} />
            </View>
            {o.items.some((i) => (i.fastingHours || 0) > 0) && o.status === 'SCHEDULED' ? <Meta>Fasting sample: confirm the patient hasn’t eaten.</Meta> : null}
            {o.reportDueAt && !['REPORT_READY', 'CANCELLED'].includes(o.status)
              ? <Meta style={new Date(o.reportDueAt) < new Date() ? { color: C.brand, fontFamily: F.bold } : undefined}>Report due {fmtStamp(o.reportDueAt)}</Meta> : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {o.status === 'SCHEDULED' ? <Btn small icon={FlaskConical} label="Collect Sample" onPress={() => setCollecting(o)} /> : null}
              {o.status === 'COLLECTED' ? <Btn small variant="soft" icon={Truck} label="Reached Lab" disabled={busy === o._id} onPress={() => act(o._id, () => api.labAdvance(o._id, 'AT_LAB'))} /> : null}
              {['COLLECTED', 'AT_LAB'].includes(o.status) ? <Btn small variant="soft" icon={Microscope} label="Testing" disabled={busy === o._id} onPress={() => act(o._id, () => api.labAdvance(o._id, 'PROCESSING'))} /> : null}
              {['COLLECTED', 'AT_LAB', 'PROCESSING', 'REPORT_READY'].includes(o.status) ? <Btn small icon={Upload} label={o.status === 'REPORT_READY' ? 'Replace Report' : 'Upload Report'} loading={busy === o._id} onPress={() => upload(o)} /> : null}
              {['COLLECTED', 'AT_LAB', 'PROCESSING'].includes(o.status) ? <Btn small variant="ghost" icon={Ban} label="Reject Sample" onPress={() => reject(o)} /> : null}
            </View>
          </Card>
        ))}
      </ScrollView>
      {collecting ? <CollectSheet order={collecting} onClose={() => setCollecting(null)} onDone={async () => { setCollecting(null); success(); await load(); }} /> : null}
    </View>
  );
}

function CollectSheet({ order, onClose, onDone }: { order: LabOrderForLab; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [paid, setPaid] = useState(order.payment.status === 'PAID' ? '' : String(order.payment.amount));
  const [method, setMethod] = useState<'CASH' | 'UPI'>('UPI');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (order.mode === 'HOME' && code.length !== 4) { setErr('Enter the customer’s 4-digit code.'); return; }
    setSaving(true);
    setErr('');
    try {
      await api.labCollect(order._id, { code: order.mode === 'HOME' ? code : undefined, ...(order.payment.status !== 'PAID' ? { paidAmount: Number(paid), method } : {}) });
      onDone();
    } catch (e) { setErr(problem(e).message); } finally { setSaving(false); }
  };
  return (
    <BottomSheet visible onClose={onClose} title="Collect sample">
      {order.mode === 'HOME' ? (
        <View style={{ gap: 6 }}>
          <Title size={14}>Customer’s 4-digit collection code</Title>
          <TextInput style={[ui.input, { fontSize: 26, letterSpacing: 12, textAlign: 'center', fontFamily: F.display }]} keyboardType="number-pad" maxLength={4} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} autoComplete="one-time-code" accessibilityLabel="Collection code" />
          <Meta>Ask for it after taking the sample. 5 tries.</Meta>
        </View>
      ) : null}
      {order.payment.status !== 'PAID' ? (
        <View style={{ gap: 8 }}>
          <Title size={14}>Amount collected (₹)</Title>
          <TextInput style={ui.input} keyboardType="decimal-pad" value={paid} onChangeText={(v) => setPaid(v.replace(/[^\d.]/g, ''))} accessibilityLabel="Amount collected" />
          <Seg value={method} onChange={setMethod} options={[{ value: 'UPI', label: 'UPI' }, { value: 'CASH', label: 'Cash' }]} />
        </View>
      ) : null}
      {err ? <Note>{err}</Note> : null}
      <Btn label={saving ? 'Saving…' : 'Mark Collected'} loading={saving} onPress={submit} />
      <PressScale onPress={onClose} style={{ alignItems: 'center', padding: 8 }}><Text style={{ color: C.muted, fontFamily: F.bold }}>Close</Text></PressScale>
    </BottomSheet>
  );
}
