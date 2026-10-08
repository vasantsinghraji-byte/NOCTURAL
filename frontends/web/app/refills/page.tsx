'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, RotateCcw } from 'lucide-react';
import type { RefillView } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { fmtDay, problem } from '@/lib/care';
import CareArt from '../_components/care/CareArt';

/** Medicine refills (same as the apps): when they're due, order again, change or pause. */
export default function RefillsPage() {
  const { patient } = useAuth();
  const cart = useCart();
  const router = useRouter();
  const [rows, setRows] = useState<RefillView[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => api.myRefills().then((r) => setRows(r.refills)).catch((e) => setError(problem(e).message)), []);
  useEffect(() => { if (patient) load(); }, [patient, load]);
  if (!patient) return <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>Sign in to see your refills</strong><Link className="mk-btn" href="/login?next=/refills">Sign In</Link></div>;

  const change = async (id: string, body: Parameters<typeof api.updateRefill>[1]) => {
    try { await api.updateRefill(id, body); await load(); } catch (e) { setError(problem(e).message); }
  };
  // Same store, same medicines in the cart, then normal checkout (prices and stock checked again).
  const orderAgain = async (r: RefillView) => {
    setBusy(r._id);
    setError('');
    try {
      const re = await api.refillReorder(r._id);
      if (!re.vendor || !re.vendor.available) throw new Error('That store isn’t taking orders right now. Order from another pharmacy.');
      const store = await api.getVendorStorefront(re.vendor._id);
      cart.clear();
      for (const it of re.items) {
        const item = store.items.find((s) => String(s.medicine._id) === String(it.medicineId));
        if (!item) continue;
        for (let i = 0; i < it.quantity; i += 1) cart.add(re.vendor._id, re.vendor.name, item);
      }
      try { sessionStorage.setItem('nabz.refillId', r._id); } catch { /* storage blocked */ }
      router.push('/checkout');
    } catch (e) { setError(problem(e).message); } finally { setBusy(''); }
  };

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 820 }}>
      <h1 className="mk-title" style={{ fontSize: 26 }}>Medicine refills</h1>
      <p className="mk-meta" style={{ margin: 0 }}>We remind you two days before regular medicines run out. Set one up from a delivered order in <Link className="link" href="/orders">My orders</Link>.</p>
      {error && <p className="mk-note" role="alert">{error}</p>}
      {!rows && !error && <div className="mk-skel" style={{ minHeight: 140 }} />}
      {rows && rows.length === 0 && <p className="mk-note neutral">No refill reminders yet.</p>}
      {(rows || []).map((r) => (
        <article key={r._id} className="mk-card" style={{ display: 'grid', gap: 10, boxShadow: r.dueSoon ? '0 0 0 2px var(--night)' : undefined }}>
          <div className="mk-row">
            <span className="mk-tile"><Pill size={22} aria-hidden="true" /></span>
            <div className="grow">
              <p className="mk-title">{r.items.map((i) => i.name).filter(Boolean).join(', ') || 'Your medicines'}</p>
              <p className="mk-meta" style={{ margin: 0 }}>{r.vendor.name || 'Same store'} · every {r.everyDays} days · next due {fmtDay(r.nextDue)}</p>
            </div>
            {r.status === 'PAUSED' ? <span className="mk-badge">Paused</span> : r.dueSoon ? <span className="mk-badge red">Due soon</span> : null}
          </div>
          <div className="mk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="mk-btn small" onClick={() => orderAgain(r)} disabled={busy === r._id}><RotateCcw size={14} aria-hidden="true" /> {busy === r._id ? 'Filling cart…' : 'Order Again'}</button>
            {([15, 30, 60, 90] as const).map((d) => <button key={d} type="button" className="mk-chip" aria-pressed={r.everyDays === d} onClick={() => change(r._id, { everyDays: d })}>Every {d} days</button>)}
            <button type="button" className="mk-btn ghost small" onClick={() => change(r._id, { status: r.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED' })}>{r.status === 'PAUSED' ? 'Resume' : 'Pause'}</button>
            <button type="button" className="mk-btn ghost small" onClick={() => change(r._id, { status: 'CANCELLED' })}>Stop</button>
          </div>
        </article>
      ))}
    </div>
  );
}
