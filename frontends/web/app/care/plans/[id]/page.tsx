'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CalendarClock, CheckCircle2, Heart, MapPin, TriangleAlert, XCircle, Wallet } from 'lucide-react';
import type { CarePlanView, PlanSession, SlotDay } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDay, fmtLongDay, fmtTime, inr, problem, fromSaved, PLAN_STATUS_LABEL as STATUS_LABEL } from '@/lib/care';
import { payForCarePlan, PaymentDismissedError } from '@/lib/razorpay';
import { confirmDialog, alertDialog, Modal } from '../../../_components/Dialog';
import CareArt from '../../../_components/care/CareArt';

const SESSION_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed', ASSIGNED: 'Confirmed', REQUESTED: 'Needs a new time', EN_ROUTE: 'On the way',
  IN_PROGRESS: 'In progress', COMPLETED: 'Done', CANCELLED: 'Cancelled'
};
const MOVABLE = ['CONFIRMED', 'ASSIGNED', 'REQUESTED'];

export default function PlanRoute() {
  return <Suspense fallback={<div className="mk-skel" style={{ minHeight: 300 }} />}><PlanDetail /></Suspense>;
}

function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const fresh = useSearchParams().get('new') === '1';
  const { patient } = useAuth();
  const [plan, setPlan] = useState<CarePlanView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [moving, setMoving] = useState<PlanSession | null>(null);

  const load = useCallback(() => api.carePlan(id).then((r) => setPlan(r.plan)).catch((e) => setError(problem(e).message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>{error}</strong><Link className="mk-btn ghost" href="/care/plans">My Plans</Link></div>;
  if (!plan) return <div className="mk-skel" style={{ minHeight: 300 }} />;

  const sessions = plan.sessions || [];
  const done = sessions.filter((s) => s.status === 'COMPLETED').length;
  const live = sessions.filter((s) => s.status !== 'CANCELLED').length || 1;
  const progress = Math.min(1, done / live);
  const next = sessions.find((s) => MOVABLE.includes(s.status) || s.status === 'EN_ROUTE');
  const open = ['ACTIVE', 'PENDING_PAYMENT'].includes(plan.status);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await load(); } catch (e) { if (!(e instanceof PaymentDismissedError)) await alertDialog({ title: 'That didn’t work', message: problem(e).message }); } finally { setBusy(''); }
  };
  const pay = () => run('pay', () => payForCarePlan(plan._id, { name: patient?.name, email: patient?.email, contact: patient?.phone }));
  const cancelSession = async (s: PlanSession) => {
    if (!(await confirmDialog({ title: `Cancel the ${fmtDay(s.scheduledDate)} session?`, message: 'Free unless the professional is already on the way.', confirmLabel: 'Cancel Session', danger: true }))) return;
    run(s._id, () => api.cancelCareBooking(s._id, 'Cancelled by the customer'));
  };
  const cancelPlan = async () => {
    if (!(await confirmDialog({ title: 'Cancel the rest of this plan?', message: plan.paymentMode === 'PREPAID' ? 'Unused sessions are refunded to your payment method (at the regular price per session used).' : 'All upcoming sessions are cancelled.', confirmLabel: 'Cancel Plan', danger: true }))) return;
    run('plan', () => api.cancelCarePlan(plan._id, 'Cancelled by the customer'));
  };
  const report = async (s: PlanSession, kind: 'EXTRA_CASH' | 'NO_SHOW') => {
    if (!(await confirmDialog({ title: kind === 'NO_SHOW' ? 'The professional didn’t come?' : 'Asked to pay extra?', message: 'Nabz support will check and get back to you. Confirmed cases get Nabz credit.', confirmLabel: 'Report' }))) return;
    run(s._id, () => api.reportSession(s._id, kind));
  };
  const changeAddress = async (addressId: string) => {
    if (!next) return;
    run('addr', async () => {
      const r = await api.changeSessionAddress(next._id, { addressId, allUpcoming: true });
      await alertDialog({ title: 'Address updated', message: `New travel fee ${inr(r.travelFee)} per visit (${r.roadKm} km).${r.extraDue ? ` ${inr(r.extraDue)} extra is added to your next bill.` : ''}${r.credit ? ` ${inr(r.credit)} comes back to you when the plan ends.` : ''}` });
    });
  };

  return (
    <div>
      {fresh && <p className="mk-note green" role="status"><CheckCircle2 size={18} aria-hidden="true" /> Booked. {plan.status === 'PENDING_PAYMENT' ? 'Pay to confirm your plan.' : 'Your professional has been told.'}</p>}

      <section className="mk-card" style={{ display: 'grid', gap: 14 }} aria-labelledby="plan-title">
        <div className="mk-row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <p className="mk-meta" style={{ margin: 0 }}>{fmtLongDay(plan.createdAt)}</p>
            <h1 id="plan-title" className="mk-title" style={{ fontSize: 28 }}>{plan.serviceName}</h1>
            <p className="mk-meta" style={{ margin: '2px 0 0' }}>{plan.store?.name} · {plan.mode === 'HOME' ? 'at home' : 'at the clinic'}{plan.patientDetails?.name ? ` · for ${plan.patientDetails.name}` : ''}</p>
          </div>
          <span className={`mk-badge ${plan.status === 'ACTIVE' ? 'red' : plan.status === 'COMPLETED' ? 'green' : ''}`} style={{ fontSize: 13, padding: '8px 14px' }}>{STATUS_LABEL[plan.status]}</span>
        </div>
        <div>
          <div className="mk-row" style={{ justifyContent: 'space-between' }}>
            <span className="mk-meta">{sessions[0] ? `${fmtDay(sessions[0].scheduledDate)}` : ''}</span>
            <strong>{done} of {plan.sessionsTotal} done</strong>
            <span className="mk-meta">{sessions.length ? fmtDay(sessions[sessions.length - 1].scheduledDate) : ''}</span>
          </div>
          <div className="mk-track" aria-hidden="true">
            <div className="rail" />
            <div className="done" style={{ width: `${progress * 100}%` }} />
            <span className="end" style={{ left: 0 }} />
            <span className="end" style={{ right: 0 }} />
            <span className="marker" style={{ left: `${Math.max(4, Math.min(96, progress * 100))}%` }}><Heart size={16} fill="currentColor" /></span>
          </div>
        </div>
        {plan.status === 'PENDING_PAYMENT' && (
          <div className="mk-card red" style={{ display: 'grid', gap: 10 }}>
            <p className="mk-title">Pay {inr(plan.payment.amount)} to confirm</p>
            <p className="mk-meta" style={{ margin: 0 }}>Your times are held{plan.payment.holdUntil ? ` until ${new Date(plan.payment.holdUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''}.</p>
            <button type="button" className="mk-btn dark" onClick={pay} disabled={busy === 'pay'}>{busy === 'pay' ? 'Opening Payment…' : 'Pay Now'}</button>
          </div>
        )}
        {plan.refund?.status !== 'NONE' && plan.refund?.amount > 0 && (
          <p className="mk-note green"><Wallet size={18} aria-hidden="true" /> Refund {inr(plan.refund.amount)}: {plan.refund.status === 'PROCESSED' ? 'sent to your payment method' : 'on its way'}.</p>
        )}
      </section>

      <div className="mk-book" style={{ marginTop: 18 }}>
        <section aria-labelledby="sessions-title">
          <h2 id="sessions-title" className="mk-h2" style={{ marginTop: 0 }}>Sessions</h2>
          <div className="mk-list">
            {sessions.map((s) => (
              <article key={s._id} className="mk-card" style={{ padding: 14, borderColor: s.needsAction ? 'var(--night)' : undefined }}>
                <div className="mk-row" style={{ flexWrap: 'wrap' }}>
                  <span className="mk-tile" style={{ background: s.status === 'COMPLETED' ? 'var(--mint-soft)' : undefined, color: s.status === 'COMPLETED' ? 'var(--mint)' : undefined }}>
                    {s.status === 'COMPLETED' ? <CheckCircle2 size={20} aria-hidden="true" /> : s.status === 'CANCELLED' ? <XCircle size={20} aria-hidden="true" /> : <CalendarClock size={20} aria-hidden="true" />}
                  </span>
                  <div className="grow">
                    <p className="mk-title" style={{ fontSize: 16 }}>{fmtDay(s.scheduledDate)}, {fmtTime(s.scheduledTime)}</p>
                    <p className="mk-meta" style={{ margin: 0 }}>Session {s.index} · {SESSION_LABEL[s.status] || s.status} · {inr(s.pricing.payableAmount)}</p>
                  </div>
                  <div className="mk-row" style={{ gap: 6 }}>
                    {open && MOVABLE.includes(s.status) && <button type="button" className="mk-btn soft small" onClick={() => setMoving(s)} disabled={Boolean(busy)}>Move</button>}
                    {open && MOVABLE.includes(s.status) && <button type="button" className="mk-btn ghost small" onClick={() => cancelSession(s)} disabled={Boolean(busy)}>Cancel</button>}
                    {['COMPLETED', 'IN_PROGRESS'].includes(s.status) && <Link className="mk-btn soft small" href={`/care-log/${s._id}`}>Care Log</Link>}
                    {['COMPLETED', 'EN_ROUTE', 'IN_PROGRESS'].includes(s.status) && (
                      <button type="button" className="mk-btn ghost small" onClick={() => report(s, s.status === 'COMPLETED' ? 'EXTRA_CASH' : 'NO_SHOW')}><TriangleAlert size={14} aria-hidden="true" /> Report</button>
                    )}
                  </div>
                </div>
                {s.needsAction && <p className="mk-note" style={{ marginTop: 10 }}>Your professional can’t make this time. Move it to a new time, or cancel it for free.</p>}
              </article>
            ))}
          </div>
        </section>

        <aside className="mk-sticky" aria-label="Plan summary">
          <div className="mk-card" style={{ display: 'grid', gap: 10 }}>
            <p className="mk-title">Summary</p>
            <dl className="mk-kv">
              <dt>Per session</dt><dd>{inr(plan.price.servicePerSession)}{plan.price.discountPercent ? ` (${plan.price.discountPercent}% off)` : ''}</dd>
              {plan.price.travelPerSession > 0 && (<><dt>Travel</dt><dd>{inr(plan.price.travelPerSession)} per visit</dd></>)}
              <dt>Total</dt><dd>{inr(plan.price.total)}</dd>
              <dt>Payment</dt><dd>{plan.paymentMode === 'PREPAID' ? `Paid upfront (${plan.payment.status.toLowerCase()})` : 'After each session'}</dd>
              {plan.creditUsed ? (<><dt>Credit used</dt><dd>{inr(plan.creditUsed)}</dd></>) : null}
              <dt>Use by</dt><dd>{fmtDay(plan.expiresAt)}</dd>
            </dl>
          </div>
          {open && plan.mode === 'HOME' && next && (patient?.savedAddresses || []).length > 0 && (
            <div className="mk-card" style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="move-address" className="mk-title" style={{ fontSize: 16 }}><MapPin size={15} aria-hidden="true" /> Visits at another address?</label>
              <select id="move-address" className="mk-select" defaultValue="" onChange={(e) => e.target.value && changeAddress(e.target.value)} disabled={busy === 'addr'}>
                <option value="">Choose a saved address</option>
                {(patient?.savedAddresses || []).filter((a) => a.coordinates?.lat).map((a) => <option key={a._id} value={a._id}>{fromSaved(a).label}</option>)}
              </select>
              <p className="mk-help" style={{ margin: 0 }}>Applies to all upcoming visits. Travel is worked out again.</p>
            </div>
          )}
          {open && <button type="button" className="mk-btn ghost block" onClick={cancelPlan} disabled={busy === 'plan'}>{busy === 'plan' ? 'Cancelling…' : 'Cancel Rest of Plan'}</button>}
          {plan.store && <Link className="mk-btn soft block" href={`/care/shop/${plan.store._id}`}>Book Again</Link>}
        </aside>
      </div>

      {moving && plan.store && (
        <MoveDialog plan={plan} session={moving} onClose={() => setMoving(null)} onMoved={async () => { setMoving(null); await load(); }} />
      )}
    </div>
  );
}

function MoveDialog({ plan, session, onClose, onMoved }: { plan: CarePlanView; session: PlanSession; onClose: () => void; onMoved: () => void }) {
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
    <Modal onClose={onClose} labelledBy="move-title" wide>
      <div style={{ display: 'grid', gap: 14 }}>
        <h2 id="move-title" className="mk-title" style={{ fontSize: 22 }}>Move session {session.index}</h2>
        {!days && <div className="mk-skel" style={{ minHeight: 120 }} />}
        {days && (
          <>
            <div className="mk-dates" role="group" aria-label="Date">
              {days.map((d) => <button key={d.date} type="button" className="mk-date" aria-pressed={date === d.date} disabled={!d.times.length} onClick={() => { setDate(d.date); setTime(''); }} style={{ opacity: d.times.length ? 1 : 0.45 }}>{fmtDay(d.date).split(' ')[0]}<b>{d.date.slice(8)}</b>{d.times.length ? `${d.times.length} free` : 'Full'}</button>)}
            </div>
            <div className="mk-slots" role="group" aria-label="Time">
              {times.map((t) => <button key={t} type="button" className="mk-slot" aria-pressed={time === t} onClick={() => setTime(t)}>{fmtTime(t)}</button>)}
            </div>
          </>
        )}
        {err && <p className="mk-note" role="alert">{err}</p>}
        <div className="mk-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="mk-btn ghost" onClick={onClose}>Keep Current Time</button>
          <button type="button" className="mk-btn" onClick={save} disabled={!date || !time || saving}>{saving ? 'Moving…' : 'Move Session'}</button>
        </div>
      </div>
    </Modal>
  );
}
