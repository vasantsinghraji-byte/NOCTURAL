import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Building2, CheckCircle2, Droplets, FileText, FlaskConical, Home, Timer, Wallet } from 'lucide-react-native';
import type { LabOrderView, SlotDay } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { LAB_STATUS_LABEL, fmtClock, fmtDay, fmtStamp, fmtTime, inr, problem, useMe } from '@/lib/market';
import { Badge, Bill, BottomSheet, Btn, Card, DateStrip, Empty, Meta, Note, Screen, TimeGrid, Title, TopBar, mk } from '@/lib/marketUI';
import { PaymentDismissedError, payLabOrder } from '@/lib/payments';
import { CallMeBack } from '@/lib/CallMeBack';
import { Skeleton } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const STEPS: Array<[LabOrderView['status'], string]> = [
  ['SCHEDULED', 'Collection booked'],
  ['COLLECTED', 'Sample collected'],
  ['AT_LAB', 'Reached the lab'],
  ['PROCESSING', 'Testing'],
  ['REPORT_READY', 'Report ready']
];

/** One lab booking: collection code, progress, report, change time / cancel / re-collection. */
export default function LabOrderDetail() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { me } = useMe();
  const [order, setOrder] = useState<LabOrderView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [picker, setPicker] = useState<'move' | 'recollect' | null>(null);
  const load = useCallback(() => api.labOrder(String(id)).then((r) => setOrder(r.order)).catch((e) => setError(problem(e).message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <View style={ui.screen}><TopBar title="Lab booking" /><Empty title={error} action={<Btn variant="ghost" label="My Lab Tests" onPress={() => router.replace('/labs/orders')} />} /></View>;
  if (!order) return <View style={ui.screen}><TopBar title="Lab booking" /><View style={{ padding: 16, gap: 12 }}><Skeleton height={180} radius={24} /><Skeleton height={240} radius={24} /></View></View>;

  const reached = STEPS.findIndex(([s]) => s === order.status);
  const payable = order.payment.mode === 'PREPAID' && order.payment.status === 'PENDING' && order.status === 'SCHEDULED';
  const fastingHours = Math.max(0, ...order.items.map((i) => i.fastingHours || 0));

  const openReport = async () => {
    setBusy('report');
    try {
      const r = await api.labReportLink(order._id);
      await WebBrowser.openBrowserAsync(r.url);
    } catch (e) { appAlert('Report not available', problem(e).message); } finally { setBusy(''); }
  };
  const pay = async () => {
    setBusy('pay');
    try { await payLabOrder(order._id, { name: me?.name, email: me?.email, contact: me?.phone }); await load(); } catch (e) {
      if (!(e instanceof PaymentDismissedError)) appAlert('Payment didn’t go through', problem(e).message);
    } finally { setBusy(''); }
  };
  const cancel = () => appAlert('Cancel this lab booking?', 'Free before the sample is collected. Any credit used comes back.', [
    { text: 'Keep', style: 'cancel' },
    {
      text: 'Cancel Booking', style: 'destructive', onPress: async () => {
        setBusy('cancel');
        try { await api.cancelLabOrder(order._id); await load(); } catch (e) { appAlert('Couldn’t cancel', problem(e).message); } finally { setBusy(''); }
      }
    }
  ]);

  return (
    <Screen header={<TopBar title="Lab booking" />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      {fresh === '1' ? <Note tone="green">{payable ? 'Booked. Pay to confirm the collection time.' : 'Booked. The lab has been told.'}</Note> : null}

      <Card style={{ gap: 14 }}>
        <View style={[mk.row, { alignItems: 'flex-start' }]}>
          <View style={mk.tile}><FlaskConical size={22} color={C.brand} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <Title size={20}>{order.store?.name}</Title>
            <View style={mk.row}>
              {order.mode === 'HOME' ? <Home size={13} color={C.muted} /> : <Building2 size={13} color={C.muted} />}
              <Meta style={{ flex: 1 }}>{order.mode === 'HOME' ? 'Home collection' : 'Lab visit'} · {fmtDay(order.slot.date)}, {fmtTime(order.slot.time)}{order.patientDetails?.name ? ` · for ${order.patientDetails.name}` : ''}</Meta>
            </View>
          </View>
          <Badge tone={order.status === 'REPORT_READY' ? 'green' : order.status === 'SAMPLE_REJECTED' ? 'red' : 'neutral'} label={LAB_STATUS_LABEL[order.status]} />
        </View>

        {payable ? (
          <Card tone="red" style={{ gap: 10 }}>
            <Text style={{ fontFamily: F.display, fontSize: 18, color: '#ffffff' }}>Pay {inr(order.payment.amount)} to confirm</Text>
            <Meta onDark>Your collection time is held{order.payment.holdUntil ? ` until ${fmtClock(order.payment.holdUntil)}` : ''}.</Meta>
            <Btn variant="light" label={busy === 'pay' ? 'Opening Payment…' : 'Pay Now'} loading={busy === 'pay'} onPress={pay} />
          </Card>
        ) : null}

        {order.collectionCode && order.status === 'SCHEDULED' ? (
          <Card tone="red" style={{ gap: 10 }}>
            <Text style={{ fontFamily: F.display, fontSize: 17, color: '#ffffff' }}>Collection code</Text>
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel={`Collection code ${order.collectionCode.split('').join(' ')}`}>
              {order.collectionCode.split('').map((c, i) => (
                <View key={i} style={{ width: 48, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#ffffff', fontFamily: F.display, fontSize: 26 }}>{c}</Text>
                </View>
              ))}
            </View>
            <Meta onDark>Share it only when the sample is taken. Nabz will never ask for it on a call.</Meta>
          </Card>
        ) : null}
        {fastingHours > 0 && order.status === 'SCHEDULED'
          ? <View style={[mk.row, { backgroundColor: C.cardAlt, padding: 12, borderRadius: 16 }]}><Droplets size={16} color={C.inkSoft} /><Meta style={{ flex: 1 }}>Fast for {fastingHours} hours before collection. Water is fine.</Meta></View> : null}
        {order.status === 'SAMPLE_REJECTED' ? (
          <View style={{ backgroundColor: C.brandSoft, borderRadius: 16, padding: 12, gap: 8 }}>
            <Text style={{ fontFamily: F.bold, color: C.roseInk }}>The lab needs a new sample</Text>
            <Meta>{order.rejection?.reason}. Re-collection is free.</Meta>
            {order.rejection?.recollectionOrder
              ? <Btn small label="See Re-collection" onPress={() => router.push(`/labs/order/${order.rejection!.recollectionOrder}`)} />
              : <Btn small label="Pick a Time" onPress={() => setPicker('recollect')} />}
          </View>
        ) : null}
        {order.lateCredit ? <View style={[mk.row, { backgroundColor: C.mintSoft, padding: 12, borderRadius: 16 }]}><Wallet size={16} color={C.mint} /><Meta style={{ flex: 1 }}>Sorry the report is late. {inr(order.lateCredit.amount)} Nabz credit added.</Meta></View> : null}
        {order.reportReady ? <Btn icon={FileText} label={busy === 'report' ? 'Opening…' : 'View Report'} loading={busy === 'report'} onPress={openReport} /> : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <Title size={18}>Progress</Title>
        {STEPS.map(([s, label], i) => {
          const at = order.timeline.find((t) => t.status === s);
          const on = i <= reached;
          return (
            <View key={s} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.brand : C.cardAlt }}>
                  {on ? <CheckCircle2 size={15} color="#ffffff" /> : <Text style={{ color: C.muted, fontFamily: F.heavy, fontSize: 12 }}>{i + 1}</Text>}
                </View>
                {i < STEPS.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: i < reached ? C.brand : C.border }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 8 }}>
                <Text style={{ fontFamily: F.bold, color: on ? C.ink : C.muted }}>{label}</Text>
                <Meta>{at ? fmtStamp(at.at) : s === 'REPORT_READY' && order.reportDueAt ? `Expected by ${fmtStamp(order.reportDueAt)}` : ''}</Meta>
              </View>
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: 10 }}>
        <Title size={18}>Tests</Title>
        <Bill
          lines={[
            ...order.items.map((i) => ({ label: i.name, amount: i.price })),
            ...(order.mode === 'HOME' ? [{ label: 'Home collection', amount: order.amounts.collectionWaived ? 'Free' : order.amounts.collectionFee }] : []),
            ...(order.amounts.gst > 0 ? [{ label: 'GST', amount: order.amounts.gst }] : []),
            ...(order.amounts.credit ? [{ label: 'Nabz credit', amount: -order.amounts.credit }] : [])
          ]}
          total={order.payment.amount}
          totalLabel={order.payment.status === 'PAID' ? 'Paid' : 'To pay'}
        />
        <Meta>{order.payment.mode === 'PREPAID' ? 'Paid online' : 'Pay at collection (cash or UPI)'}{order.payment.status === 'REFUND_PENDING' ? '. Refund on its way.' : ''}</Meta>
      </Card>
      {order.status === 'SCHEDULED' ? (
        <>
          <Btn variant="soft" icon={Timer} label="Change Time" onPress={() => setPicker('move')} />
          <Btn variant="ghost" label={busy === 'cancel' ? 'Cancelling…' : 'Cancel Booking'} loading={busy === 'cancel'} onPress={cancel} />
        </>
      ) : null}

      <CallMeBack topic="LAB" context={{ kind: 'LAB_ORDER', id: order._id }} label="Question about this test? We’ll call" />

      {picker && order.store ? (
        <SlotSheet
          title={picker === 'move' ? 'Change collection time' : 'Free re-collection'}
          storeId={order.store._id}
          fasting={fastingHours > 0}
          mode={order.mode}
          onClose={() => setPicker(null)}
          onPick={async (date, time) => {
            if (picker === 'move') await api.moveLabOrder(order._id, date, time);
            else await api.bookRecollection(order._id, date, time);
            setPicker(null);
            await load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function SlotSheet({ title, storeId, fasting, mode, onClose, onPick }: { title: string; storeId: string; fasting: boolean; mode: 'HOME' | 'CLINIC'; onClose: () => void; onPick: (date: string, time: string) => Promise<void> }) {
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    // Any of the lab's tests gives its calendar; the first one on the menu is enough.
    api.labMenu(storeId).then((m) => api.marketSlots(storeId, { serviceId: m.tests[0].service._id, mode, days: 10 }))
      .then((r) => { setDays(r.days); setDate(r.days.find((d) => d.times.length)?.date || ''); })
      .catch((e) => { setErr(problem(e).message); setDays([]); });
  }, [storeId, mode]);
  const times = (days?.find((d) => d.date === date)?.times || []).filter((t) => !fasting || t <= '10:00');
  return (
    <BottomSheet visible onClose={onClose} title={title}>
      <DateStrip days={days} value={date} onChange={(d) => { setDate(d); setTime(''); }} openLabel={() => 'Open'} />
      <TimeGrid times={times} value={time} onChange={setTime} />
      {err ? <Note>{err}</Note> : null}
      <Btn label={saving ? 'Saving…' : 'Confirm Time'} loading={saving} disabled={!date || !time}
        onPress={async () => { setSaving(true); setErr(''); try { await onPick(date, time); } catch (e) { setErr(problem(e).message); } finally { setSaving(false); } }} />
    </BottomSheet>
  );
}
