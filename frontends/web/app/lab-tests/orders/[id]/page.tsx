'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2, Droplets, FileText, FlaskConical, Home, Building2, Timer, Wallet } from 'lucide-react';
import type { LabOrderView, SlotDay } from '@medrush/shared';
import { api } from '@/lib/api';
import { fmtDay, fmtTime, inr, problem, LAB_STATUS_LABEL } from '@/lib/care';
import { confirmDialog, alertDialog, Modal } from '../../../_components/Dialog';
import CareArt from '../../../_components/care/CareArt';

const STEPS: Array<[LabOrderView['status'], string]> = [
  ['SCHEDULED', 'Collection booked'],
  ['COLLECTED', 'Sample collected'],
  ['AT_LAB', 'Reached the lab'],
  ['PROCESSING', 'Testing'],
  ['REPORT_READY', 'Report ready']
];

export default function LabOrderRoute() {
  return <Suspense fallback={<div className="mk-skel" style={{ minHeight: 300 }} />}><LabOrderDetail /></Suspense>;
}

function LabOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const fresh = useSearchParams().get('new') === '1';
  const [order, setOrder] = useState<LabOrderView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [picker, setPicker] = useState<'move' | 'recollect' | null>(null);
  const load = useCallback(() => api.labOrder(id).then((r) => setOrder(r.order)).catch((e) => setError(problem(e).message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>{error}</strong><Link className="mk-btn ghost" href="/lab-tests/orders">My Lab Tests</Link></div>;
  if (!order) return <div className="mk-skel" style={{ minHeight: 300 }} />;

  const reached = STEPS.findIndex(([s]) => s === order.status);
  const openReport = async () => {
    setBusy('report');
    try {
      const r = await api.labReportLink(order._id);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (e) { await alertDialog({ title: 'Report not available', message: problem(e).message }); } finally { setBusy(''); }
  };
  const cancel = async () => {
    if (!(await confirmDialog({ title: 'Cancel this lab booking?', message: 'Free before the sample is collected. Any credit used comes back.', confirmLabel: 'Cancel Booking', danger: true }))) return;
    setBusy('cancel');
    try { await api.cancelLabOrder(order._id); await load(); } catch (e) { await alertDialog({ title: 'Couldn’t cancel', message: problem(e).message }); } finally { setBusy(''); }
  };

  return (
    <div>
      {fresh && <p className="mk-note green" role="status"><CheckCircle2 size={18} aria-hidden="true" /> Booked. The lab has been told.</p>}
      <div className="mk-book">
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="mk-card" aria-labelledby="order-title" style={{ display: 'grid', gap: 14 }}>
            <div className="mk-row" style={{ alignItems: 'flex-start' }}>
              <span className="mk-tile"><FlaskConical size={22} aria-hidden="true" /></span>
              <div className="grow">
                <h1 id="order-title" className="mk-title" style={{ fontSize: 26 }}>{order.store?.name}</h1>
                <p className="mk-meta" style={{ margin: 0 }}>{order.mode === 'HOME' ? <><Home size={13} aria-hidden="true" /> Home collection</> : <><Building2 size={13} aria-hidden="true" /> Lab visit</>} · {fmtDay(order.slot.date)}, {fmtTime(order.slot.time)}{order.patientDetails?.name ? ` · for ${order.patientDetails.name}` : ''}</p>
              </div>
              <span className={`mk-badge ${order.status === 'REPORT_READY' ? 'green' : order.status === 'SAMPLE_REJECTED' ? 'red' : ''}`}>{LAB_STATUS_LABEL[order.status]}</span>
            </div>

            {order.collectionCode && order.status === 'SCHEDULED' && (
              <div className="mk-card red" style={{ display: 'grid', gap: 10 }}>
                <p className="mk-title">Collection code</p>
                <div className="mk-code" aria-label={`Collection code ${order.collectionCode.split('').join(' ')}`}>{order.collectionCode.split('').map((c, i) => <span key={i} aria-hidden="true" style={{ background: 'rgba(255,255,255,.18)' }}>{c}</span>)}</div>
                <p className="mk-meta" style={{ margin: 0 }}>Share it only when the sample is taken. Nabz will never ask for it on a call.</p>
              </div>
            )}
            {order.items.some((i) => (i.fastingHours || 0) > 0) && order.status === 'SCHEDULED' && (
              <p className="mk-note neutral"><Droplets size={16} aria-hidden="true" /> Fast for {Math.max(...order.items.map((i) => i.fastingHours || 0))} hours before collection. Water is fine.</p>
            )}
            {order.status === 'SAMPLE_REJECTED' && (
              <div className="mk-note">
                <div className="grow">
                  <strong>The lab needs a new sample</strong>
                  <p style={{ margin: '4px 0 8px' }}>{order.rejection?.reason}. Re-collection is free.</p>
                  {order.rejection?.recollectionOrder
                    ? <Link className="mk-btn small" href={`/lab-tests/orders/${order.rejection.recollectionOrder}`}>See Re-collection</Link>
                    : <button type="button" className="mk-btn small" onClick={() => setPicker('recollect')}>Pick a Time</button>}
                </div>
              </div>
            )}
            {order.lateCredit && <p className="mk-note green"><Wallet size={16} aria-hidden="true" /> Sorry the report is late. {inr(order.lateCredit.amount)} Nabz credit added.</p>}
            {order.reportReady && (
              <button type="button" className="mk-btn" onClick={openReport} disabled={busy === 'report'}><FileText size={16} aria-hidden="true" /> {busy === 'report' ? 'Opening…' : 'View Report'}</button>
            )}
          </section>

          <section className="mk-card" aria-labelledby="progress-title">
            <h2 id="progress-title" className="mk-title" style={{ fontSize: 18, marginBottom: 12 }}>Progress</h2>
            <div className="mk-steps">
              {STEPS.map(([s, label], i) => {
                const at = order.timeline.find((t) => t.status === s);
                return (
                  <div key={s} className={`mk-step ${i <= reached ? 'on' : ''}`}>
                    <span className="dot" aria-hidden="true">{i <= reached ? <CheckCircle2 size={14} /> : i + 1}</span>
                    <div>
                      <strong>{label}</strong>
                      <p className="mk-meta" style={{ margin: 0 }}>{at ? new Date(at.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : s === 'REPORT_READY' && order.reportDueAt ? `Expected by ${new Date(order.reportDueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="mk-sticky" aria-label="Bill">
          <div className="mk-card mk-bill">
            <p className="mk-title">Tests</p>
            {order.items.map((i) => <div key={i.name} className="line"><span>{i.name}</span><span>{inr(i.price)}</span></div>)}
            {order.mode === 'HOME' && <div className="line"><span>Home collection</span><span>{order.amounts.collectionWaived ? 'Free' : inr(order.amounts.collectionFee)}</span></div>}
            {order.amounts.gst > 0 && <div className="line"><span>GST</span><span>{inr(order.amounts.gst)}</span></div>}
            {order.amounts.credit ? <div className="line neg"><span>Nabz credit</span><span>− {inr(order.amounts.credit)}</span></div> : null}
            <div className="line total"><span>{order.payment.status === 'PAID' ? 'Paid' : 'To pay'}</span><span>{inr(order.payment.amount)}</span></div>
            <p className="mk-help" style={{ margin: 0 }}>{order.payment.mode === 'PREPAID' ? 'Paid online' : 'Pay at collection (cash or UPI)'}{order.payment.status === 'REFUND_PENDING' ? '. Refund on its way.' : ''}</p>
          </div>
          {order.status === 'SCHEDULED' && (
            <>
              <button type="button" className="mk-btn soft block" onClick={() => setPicker('move')}><Timer size={15} aria-hidden="true" /> Change Time</button>
              <button type="button" className="mk-btn ghost block" onClick={cancel} disabled={busy === 'cancel'}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel Booking'}</button>
            </>
          )}
        </aside>
      </div>

      {picker && order.store && (
        <SlotPicker
          title={picker === 'move' ? 'Change collection time' : 'Free re-collection'}
          storeId={order.store._id}
          fasting={order.items.some((i) => (i.fastingHours || 0) > 0)}
          mode={order.mode}
          onClose={() => setPicker(null)}
          onPick={async (date, time) => {
            if (picker === 'move') await api.moveLabOrder(order._id, date, time);
            else await api.bookRecollection(order._id, date, time);
            setPicker(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function SlotPicker({ title, storeId, fasting, mode, onClose, onPick }: { title: string; storeId: string; fasting: boolean; mode: 'HOME' | 'CLINIC'; onClose: () => void; onPick: (date: string, time: string) => Promise<void> }) {
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    // Any of the lab's tests gives its calendar; the menu's first test is enough.
    api.labMenu(storeId).then((m) => api.marketSlots(storeId, { serviceId: m.tests[0].service._id, mode, days: 10 }))
      .then((r) => { setDays(r.days); setDate(r.days.find((d) => d.times.length)?.date || ''); })
      .catch((e) => { setErr(problem(e).message); setDays([]); });
  }, [storeId, mode]);
  const times = (days?.find((d) => d.date === date)?.times || []).filter((t) => !fasting || t <= '10:00');
  return (
    <Modal onClose={onClose} labelledBy="slot-dialog" wide>
      <div style={{ display: 'grid', gap: 14 }}>
        <h2 id="slot-dialog" className="mk-title" style={{ fontSize: 22 }}>{title}</h2>
        {!days && <div className="mk-skel" style={{ minHeight: 120 }} />}
        {days && (
          <>
            <div className="mk-dates" role="group" aria-label="Date">{days.map((d) => <button key={d.date} type="button" className="mk-date" aria-pressed={date === d.date} disabled={!d.times.length} onClick={() => { setDate(d.date); setTime(''); }} style={{ opacity: d.times.length ? 1 : 0.45 }}>{fmtDay(d.date).split(' ')[0]}<b>{d.date.slice(8)}</b>{d.times.length ? 'Open' : 'Full'}</button>)}</div>
            <div className="mk-slots" role="group" aria-label="Time">{times.map((t) => <button key={t} type="button" className="mk-slot" aria-pressed={time === t} onClick={() => setTime(t)}>{fmtTime(t)}</button>)}</div>
          </>
        )}
        {err && <p className="mk-note" role="alert">{err}</p>}
        <div className="mk-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="mk-btn ghost" onClick={onClose}>Close</button>
          <button type="button" className="mk-btn" disabled={!date || !time || saving} onClick={async () => { setSaving(true); setErr(''); try { await onPick(date, time); } catch (e) { setErr(problem(e).message); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Confirm Time'}</button>
        </div>
      </div>
    </Modal>
  );
}
