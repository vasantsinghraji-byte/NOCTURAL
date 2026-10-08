import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarClock, CheckCircle2, ClipboardList, Heart, MapPin, TriangleAlert, Wallet, XCircle } from 'lucide-react-native';
import type { CarePlanView, PlanSession, SlotDay } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { PLAN_STATUS_LABEL, SESSION_LABEL, fmtClock, fmtDay, fmtLongDay, fmtTime, inr, problem, useMe, usableAddresses, fromSaved } from '@/lib/market';
import { Badge, BottomSheet, Btn, Card, DateStrip, Empty, Meta, Note, Screen, TimeGrid, Title, TopBar, mk } from '@/lib/marketUI';
import { PaymentDismissedError, payCarePlan } from '@/lib/payments';
import { CallMeBack } from '@/lib/CallMeBack';
import { Skeleton } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const MOVABLE = ['CONFIRMED', 'ASSIGNED', 'REQUESTED'];

const confirm = (title: string, message: string, label: string, destructive = false) => new Promise<boolean>((resolve) => {
  appAlert(title, message, [
    { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
    { text: label, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) }
  ], { onDismiss: () => resolve(false) });
});

/** One care plan: progress, sessions (move / cancel / report), payment and refunds. */
export default function PlanDetail() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { me } = useMe();
  const [plan, setPlan] = useState<CarePlanView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [moving, setMoving] = useState<PlanSession | null>(null);
  const [addrOpen, setAddrOpen] = useState(false);

  const load = useCallback(() => api.carePlan(String(id)).then((r) => setPlan(r.plan)).catch((e) => setError(problem(e).message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <View style={ui.screen}><TopBar title="Care plan" /><Empty title={error} action={<Btn variant="ghost" label="My Plans" onPress={() => router.replace('/care/plans')} />} /></View>;
  if (!plan) return <View style={ui.screen}><TopBar title="Care plan" /><View style={{ padding: 16, gap: 12 }}><Skeleton height={180} radius={24} /><Skeleton height={300} radius={24} /></View></View>;

  const sessions = plan.sessions || [];
  const done = sessions.filter((s) => s.status === 'COMPLETED').length;
  const live = sessions.filter((s) => s.status !== 'CANCELLED').length || 1;
  const progress = Math.min(1, done / live);
  const next = sessions.find((s) => MOVABLE.includes(s.status) || s.status === 'EN_ROUTE');
  const open = ['ACTIVE', 'PENDING_PAYMENT'].includes(plan.status);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await load(); } catch (e) { if (!(e instanceof PaymentDismissedError)) appAlert('That didn’t work', problem(e).message); } finally { setBusy(''); }
  };
  const pay = () => run('pay', () => payCarePlan(plan._id, { name: me?.name, email: me?.email, contact: me?.phone }));
  const cancelSession = async (s: PlanSession) => {
    if (await confirm(`Cancel the ${fmtDay(s.scheduledDate)} session?`, 'Free unless the professional is already on the way.', 'Cancel Session', true)) run(s._id, () => api.cancelCareBooking(s._id, 'Cancelled by the customer'));
  };
  const cancelPlan = async () => {
    const msg = plan.paymentMode === 'PREPAID' ? 'Unused sessions are refunded to your payment method (sessions used are charged at the regular price).' : 'All upcoming sessions are cancelled.';
    if (await confirm('Cancel the rest of this plan?', msg, 'Cancel Plan', true)) run('plan', () => api.cancelCarePlan(plan._id, 'Cancelled by the customer'));
  };
  const report = async (s: PlanSession, kind: 'EXTRA_CASH' | 'NO_SHOW') => {
    if (await confirm(kind === 'NO_SHOW' ? 'The professional didn’t come?' : 'Asked to pay extra?', 'Nabz support will check and get back to you. Confirmed cases get Nabz credit.', 'Report')) {
      run(s._id, async () => { await api.reportSession(s._id, kind); appAlert('Reported', 'Thanks. Nabz support will look into it.'); });
    }
  };
  const changeAddress = (addressId: string) => {
    if (!next) return;
    setAddrOpen(false);
    run('addr', async () => {
      const r = await api.changeSessionAddress(next._id, { addressId, allUpcoming: true });
      appAlert('Address updated', `New travel fee ${inr(r.travelFee)} per visit (${r.roadKm} km).${r.extraDue ? ` ${inr(r.extraDue)} extra is added to your next bill.` : ''}${r.credit ? ` ${inr(r.credit)} comes back to you when the plan ends.` : ''}`);
    });
  };
  const addresses = usableAddresses(me?.savedAddresses);

  return (
    <Screen header={<TopBar title="Care plan" />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      {fresh === '1' ? <Note tone="green">{plan.status === 'PENDING_PAYMENT' ? 'Booked. Pay to confirm your plan.' : 'Booked. Your professional has been told.'}</Note> : null}

      <Card style={{ gap: 14 }}>
        <View style={[mk.row, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <Meta>{fmtLongDay(plan.createdAt)}</Meta>
            <Title size={24}>{plan.serviceName}</Title>
            <Meta>{plan.store?.name} · {plan.mode === 'HOME' ? 'at home' : 'at the clinic'}{plan.patientDetails?.name ? ` · for ${plan.patientDetails.name}` : ''}</Meta>
          </View>
          <Badge tone={plan.status === 'ACTIVE' ? 'red' : plan.status === 'COMPLETED' ? 'green' : 'neutral'} label={PLAN_STATUS_LABEL[plan.status]} />
        </View>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Meta>{sessions[0] ? fmtDay(sessions[0].scheduledDate) : ''}</Meta>
            <Text style={{ fontFamily: F.heavy, color: C.ink }}>{done} of {plan.sessionsTotal} done</Text>
            <Meta>{sessions.length ? fmtDay(sessions[sessions.length - 1].scheduledDate) : ''}</Meta>
          </View>
          {/* Journey track with a heart marker */}
          <View style={{ height: 30, justifyContent: 'center' }} accessibilityLabel={`${done} of ${plan.sessionsTotal} sessions done`}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.cardAlt }} />
            <View style={{ position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: C.brand, width: `${progress * 100}%` }} />
            <View style={{ position: 'absolute', left: `${Math.max(2, Math.min(90, progress * 100 - 4))}%`, width: 30, height: 30, borderRadius: 15, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.card }}>
              <Heart size={13} color="#ffffff" fill="#ffffff" />
            </View>
          </View>
        </View>
        {plan.status === 'PENDING_PAYMENT' ? (
          <Card tone="red" style={{ gap: 10 }}>
            <Text style={{ fontFamily: F.display, fontSize: 18, color: '#ffffff' }}>Pay {inr(plan.payment.amount)} to confirm</Text>
            <Meta onDark>Your times are held{plan.payment.holdUntil ? ` until ${fmtClock(plan.payment.holdUntil)}` : ''}.</Meta>
            <Btn variant="light" label={busy === 'pay' ? 'Opening Payment…' : 'Pay Now'} loading={busy === 'pay'} onPress={pay} />
          </Card>
        ) : null}
        {plan.refund?.status !== 'NONE' && plan.refund?.amount > 0
          ? <Note tone="green">{`Refund ${inr(plan.refund.amount)}: ${plan.refund.status === 'PROCESSED' ? 'sent to your payment method' : 'on its way'}.`}</Note> : null}
      </Card>

      <Title size={20}>Sessions</Title>
      {sessions.map((s) => (
        <Card key={s._id} style={[{ padding: 14, gap: 10 }, s.needsAction && { borderWidth: 2, borderColor: C.brand }]}>
          <View style={mk.row}>
            <View style={[mk.tile, s.status === 'COMPLETED' && { backgroundColor: C.mintSoft }]}>
              {s.status === 'COMPLETED' ? <CheckCircle2 size={20} color={C.mint} /> : s.status === 'CANCELLED' ? <XCircle size={20} color={C.muted} /> : <CalendarClock size={20} color={C.brand} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{fmtDay(s.scheduledDate)}, {fmtTime(s.scheduledTime)}</Text>
              <Meta>Session {s.index} · {SESSION_LABEL[s.status] || s.status} · {inr(s.pricing.payableAmount)}</Meta>
            </View>
          </View>
          {s.needsAction ? <Note>Your professional can’t make this time. Move it to a new time, or cancel it for free.</Note> : null}
          {['IN_PROGRESS', 'COMPLETED'].includes(s.status) ? (
            <Btn small variant="soft" icon={ClipboardList} label="Care Log" onPress={() => router.push({ pathname: '/care-log/[id]', params: { id: s._id } })} style={{ alignSelf: 'flex-start' }} />
          ) : null}
          {(open && MOVABLE.includes(s.status)) || ['COMPLETED', 'EN_ROUTE', 'IN_PROGRESS'].includes(s.status) ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {open && MOVABLE.includes(s.status) ? <Btn small variant="soft" label="Move" onPress={() => setMoving(s)} disabled={Boolean(busy)} /> : null}
              {open && MOVABLE.includes(s.status) ? <Btn small variant="ghost" label="Cancel" onPress={() => cancelSession(s)} disabled={Boolean(busy)} /> : null}
              {['COMPLETED', 'EN_ROUTE', 'IN_PROGRESS'].includes(s.status)
                ? <Btn small variant="ghost" icon={TriangleAlert} label="Report" onPress={() => report(s, s.status === 'COMPLETED' ? 'EXTRA_CASH' : 'NO_SHOW')} /> : null}
            </View>
          ) : null}
        </Card>
      ))}

      <Card style={{ gap: 10 }}>
        <Title size={18}>Summary</Title>
        {[
          ['Per session', `${inr(plan.price.servicePerSession)}${plan.price.discountPercent ? ` (${plan.price.discountPercent}% off)` : ''}`],
          ...(plan.price.travelPerSession > 0 ? [['Travel', `${inr(plan.price.travelPerSession)} per visit`]] : []),
          ['Total', inr(plan.price.total)],
          ['Payment', plan.paymentMode === 'PREPAID' ? `Paid upfront (${plan.payment.status.toLowerCase()})` : 'After each session'],
          ...(plan.creditUsed ? [['Credit used', inr(plan.creditUsed)]] : []),
          ['Use by', fmtDay(plan.expiresAt)]
        ].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Meta>{k}</Meta><Text style={{ fontFamily: F.bold, color: C.ink, fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
      </Card>
      {open && plan.mode === 'HOME' && next && addresses.length > 0
        ? <Btn variant="soft" icon={MapPin} label={busy === 'addr' ? 'Updating…' : 'Visits at Another Address?'} loading={busy === 'addr'} onPress={() => setAddrOpen(true)} /> : null}
      {open ? <Btn variant="ghost" label={busy === 'plan' ? 'Cancelling…' : 'Cancel Rest of Plan'} loading={busy === 'plan'} onPress={cancelPlan} /> : null}
      <CallMeBack topic="VISIT" context={{ kind: 'PLAN', id: plan._id }} label="Question about this plan? We’ll call" />
      {plan.store ? <Btn variant="soft" label="Book Again" onPress={() => router.push(`/care/shop/${plan.store!._id}`)} /> : null}
      {(plan.creditUsed || 0) > 0 || plan.refund?.amount ? <View style={mk.row}><Wallet size={14} color={C.muted} /><Meta>Credits and refunds show in your Nabz wallet.</Meta></View> : null}

      <BottomSheet visible={addrOpen} onClose={() => setAddrOpen(false)} title="Move upcoming visits to">
        {addresses.map((a) => <Btn key={a._id} variant="ghost" label={fromSaved(a).label} onPress={() => changeAddress(String(a._id))} />)}
        <Meta>Applies to all upcoming visits. Travel is worked out again.</Meta>
      </BottomSheet>
      {moving && plan.store ? <MoveSheet plan={plan} session={moving} onClose={() => setMoving(null)} onMoved={async () => { setMoving(null); await load(); }} /> : null}
    </Screen>
  );
}

function MoveSheet({ plan, session, onClose, onMoved }: { plan: CarePlanView; session: PlanSession; onClose: () => void; onMoved: () => void }) {
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.marketSlots(plan.store!._id, { serviceId: plan.service, mode: plan.mode, days: 14 })
      .then((r) => { setDays(r.days); setDate(r.days.find((d) => d.times.length)?.date || ''); })
      .catch((e) => { setErr(problem(e).message); setDays([]); });
  }, [plan]);
  const save = async () => {
    setSaving(true);
    setErr('');
    try { await api.moveSession(session._id, date, time); onMoved(); } catch (e) { setErr(problem(e).message); } finally { setSaving(false); }
  };
  const times = days?.find((d) => d.date === date)?.times || [];
  return (
    <BottomSheet visible onClose={onClose} title={`Move session ${session.index}`}>
      <DateStrip days={days} value={date} onChange={(d) => { setDate(d); setTime(''); }} />
      <TimeGrid times={times} value={time} onChange={setTime} />
      {err ? <Note>{err}</Note> : null}
      <Btn label={saving ? 'Moving…' : 'Move Session'} loading={saving} disabled={!date || !time} onPress={save} />
      <Btn variant="ghost" label="Keep Current Time" onPress={onClose} />
    </BottomSheet>
  );
}
