'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, Home, Building2, Upload, Ban, Truck, Microscope, Store } from 'lucide-react';
import type { LabOrderForLab } from '@medrush/shared';
import { api } from '@/lib/api';
import { addDays, fmtDay, fmtTime, inr, problem, todayIst, LAB_STATUS_LABEL } from '@/lib/care';
import { Modal, promptDialog } from '../_components/Dialog';
import CareArt from '../_components/care/CareArt';

/** Path-lab partner: the day's collections, sample steps and report upload. */
export default function LabDashboard() {
  const [date, setDate] = useState(todayIst());
  const [orders, setOrders] = useState<LabOrderForLab[] | null>(null);
  const [error, setError] = useState('');
  const [collecting, setCollecting] = useState<LabOrderForLab | null>(null);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string>('');

  const load = useCallback(() => api.labPartnerOrders({ date }).then((r) => { setOrders(r.orders); setError(''); }).catch((e) => {
    const status = (e as { status?: number }).status;
    setError(status === 401 || status === 403 ? 'auth' : problem(e).message);
    setOrders([]);
  }), [date]);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); await load(); } catch (e) { setError(problem(e).message); } finally { setBusy(''); }
  };
  const reject = async (o: LabOrderForLab) => {
    const reason = await promptDialog({ title: 'Why can’t the sample be tested?', label: 'Reason', placeholder: 'Sample clotted…', minLength: 3, maxLength: 200 });
    if (reason) act(o._id, () => api.labReject(o._id, reason));
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = uploadFor.current;
    e.target.value = '';
    if (file && id) act(id, () => api.uploadLabReport(id, file, file.name));
  };

  if (error === 'auth') return <div className="mk-empty"><div className="art"><CareArt kind="lab" /></div><strong>Sign in with your lab partner account</strong><Link className="mk-btn" href="/lab/login">Lab Sign In</Link></div>;
  const counts = (orders || []).reduce<Record<string, number>>((m, o) => ({ ...m, [o.status]: (m[o.status] || 0) + 1 }), {});

  return (
    <div>
      <section className="mk-hero" aria-labelledby="lab-dash">
        <div className="in slim">
          <div>
            <h1 id="lab-dash">Lab dashboard</h1>
            <p>{orders ? `${orders.length} booking${orders.length === 1 ? '' : 's'} on ${fmtDay(date)}. ${counts.SCHEDULED || 0} to collect, ${(counts.COLLECTED || 0) + (counts.AT_LAB || 0) + (counts.PROCESSING || 0)} in progress.` : 'Loading today…'}</p>
            <div className="cta-row"><Link className="mk-btn dark" href="/partner/shop?kind=LAB"><Store size={16} aria-hidden="true" /> Tests, Prices & Hours</Link></div>
          </div>
          <div className="art"><CareArt kind="lab" /></div>
        </div>
      </section>

      <div className="mk-dates" role="group" aria-label="Day">
        {[-1, 0, 1, 2, 3, 4, 5].map((n) => {
          const d = addDays(todayIst(), n);
          return <button key={d} type="button" className="mk-date" aria-pressed={date === d} onClick={() => setDate(d)}>{n === 0 ? 'Today' : fmtDay(d).split(' ')[0]}<b>{d.slice(8)}</b>{fmtDay(d).split(' ')[2]}</button>;
        })}
      </div>
      {error && <p className="mk-note" role="alert">{error}</p>}
      <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={onFile} aria-label="Report file" />

      <div aria-live="polite" className="mk-list" style={{ marginTop: 12 }}>
        {!orders && <div className="mk-skel" />}
        {orders && orders.length === 0 && <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>No bookings this day</strong></div>}
        {(orders || []).map((o) => (
          <article key={o._id} className="mk-card" style={{ display: 'grid', gap: 10 }}>
            <div className="mk-row" style={{ flexWrap: 'wrap' }}>
              <span className="mk-tile">{o.mode === 'HOME' ? <Home size={20} aria-hidden="true" /> : <Building2 size={20} aria-hidden="true" />}</span>
              <div className="grow">
                <p className="mk-title" style={{ fontSize: 16 }}>{fmtTime(o.slot.time)} · {o.patientDetails?.name || 'Customer'}</p>
                <p className="mk-meta" style={{ margin: 0 }}>{o.items.map((i) => i.name).join(', ')}</p>
                <p className="mk-meta" style={{ margin: 0 }}>{o.mode === 'HOME' ? `Home collection${o.address?.city ? `, ${o.address.street}, ${o.address.city}` : ''}` : 'Walk-in'} · {o.payment.status === 'PAID' ? 'Paid' : `Collect ${inr(o.payment.amount)}`}</p>
              </div>
              <span className={`mk-badge ${o.status === 'REPORT_READY' ? 'green' : o.status === 'SAMPLE_REJECTED' ? 'red' : ''}`}>{LAB_STATUS_LABEL[o.status]}</span>
            </div>
            {o.items.some((i) => (i.fastingHours || 0) > 0) && o.status === 'SCHEDULED' && <p className="mk-help" style={{ margin: 0 }}>Fasting sample: confirm the patient hasn’t eaten.</p>}
            {o.reportDueAt && !['REPORT_READY', 'CANCELLED'].includes(o.status) && <p className={new Date(o.reportDueAt) < new Date() ? 'mk-error' : 'mk-help'} style={{ margin: 0 }}>Report due {new Date(o.reportDueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</p>}
            <div className="mk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {o.status === 'SCHEDULED' && <button type="button" className="mk-btn small" onClick={() => setCollecting(o)}><FlaskConical size={14} aria-hidden="true" /> Collect Sample</button>}
              {o.status === 'COLLECTED' && <button type="button" className="mk-btn soft small" disabled={busy === o._id} onClick={() => act(o._id, () => api.labAdvance(o._id, 'AT_LAB'))}><Truck size={14} aria-hidden="true" /> Reached Lab</button>}
              {['COLLECTED', 'AT_LAB'].includes(o.status) && <button type="button" className="mk-btn soft small" disabled={busy === o._id} onClick={() => act(o._id, () => api.labAdvance(o._id, 'PROCESSING'))}><Microscope size={14} aria-hidden="true" /> Testing</button>}
              {['COLLECTED', 'AT_LAB', 'PROCESSING', 'REPORT_READY'].includes(o.status) && <button type="button" className="mk-btn small" disabled={busy === o._id} onClick={() => { uploadFor.current = o._id; fileRef.current?.click(); }}><Upload size={14} aria-hidden="true" /> {o.status === 'REPORT_READY' ? 'Replace Report' : 'Upload Report'}</button>}
              {['COLLECTED', 'AT_LAB', 'PROCESSING'].includes(o.status) && <button type="button" className="mk-btn ghost small" onClick={() => reject(o)}><Ban size={14} aria-hidden="true" /> Reject Sample</button>}
            </div>
          </article>
        ))}
      </div>
      {collecting && <CollectDialog order={collecting} onClose={() => setCollecting(null)} onDone={async () => { setCollecting(null); await load(); }} />}
    </div>
  );
}

function CollectDialog({ order, onClose, onDone }: { order: LabOrderForLab; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [paid, setPaid] = useState(order.payment.status === 'PAID' ? '' : String(order.payment.amount));
  const [method, setMethod] = useState<'CASH' | 'UPI'>('UPI');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await api.labCollect(order._id, { code: order.mode === 'HOME' ? code : undefined, ...(order.payment.status !== 'PAID' ? { paidAmount: Number(paid), method } : {}) });
      onDone();
    } catch (e2) { setErr(problem(e2).message); } finally { setSaving(false); }
  };
  return (
    <Modal onClose={onClose} labelledBy="collect-title" as="form" onSubmit={submit}>
      <div style={{ display: 'grid', gap: 14 }}>
        <h2 id="collect-title" className="mk-title" style={{ fontSize: 22 }}>Collect sample</h2>
        {order.mode === 'HOME' && (
          <div className="mk-field">
            <label htmlFor="c-code">Customer’s 4-digit collection code</label>
            <input id="c-code" className="mk-input" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} maxLength={4} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ fontSize: 24, letterSpacing: '.4em', textAlign: 'center' }} />
            <span className="mk-help">Ask the customer for it after taking the sample. 5 tries.</span>
          </div>
        )}
        {order.payment.status !== 'PAID' && (
          <div className="mk-split">
            <div className="mk-field"><label htmlFor="c-paid">Amount collected (₹)</label><input id="c-paid" className="mk-input" type="number" min={0} inputMode="decimal" required value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
            <div className="mk-field"><label htmlFor="c-method">Paid by</label><select id="c-method" className="mk-select" value={method} onChange={(e) => setMethod(e.target.value as 'UPI')}><option value="UPI">UPI</option><option value="CASH">Cash</option></select></div>
          </div>
        )}
        {err && <p className="mk-note" role="alert">{err}</p>}
        <div className="mk-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="mk-btn ghost" onClick={onClose}>Close</button>
          <button type="submit" className="mk-btn" disabled={saving}>{saving ? 'Saving…' : 'Mark Collected'}</button>
        </div>
      </div>
    </Modal>
  );
}
