'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { PharmacyOrder } from '@medrush/shared';

export default function OrdersPage() {
  const { patient, loading } = useAuth();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!patient) { setBusy(false); return; }
    api.getMyOrders({ limit: 50 })
      .then((res) => setOrders(res.orders))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load orders'))
      .finally(() => setBusy(false));
  }, [patient, loading]);

  if (loading || busy) return <p className="muted" style={{ marginTop: 20 }}>Loading…</p>;
  if (!patient) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Login to see your orders</h2>
        <Link href="/login?next=/orders" className="btn">Login</Link>
      </div>
    );
  }

  return (
    <>
      <div className="mk-grid two" style={{ marginTop: 16 }}>
        <Link className="mk-card-link" href="/care/plans"><div className="mk-card red"><p className="mk-title">My care plans</p><p className="mk-meta" style={{ margin: 0 }}>Physio, home care and nursing sessions</p></div></Link>
        <Link className="mk-card-link" href="/lab-tests/orders"><div className="mk-card"><p className="mk-title">My lab tests</p><p className="mk-meta" style={{ margin: 0 }}>Collections, progress and reports</p></div></Link>
        <Link className="mk-card-link" href="/refills"><div className="mk-card"><p className="mk-title">Medicine refills</p><p className="mk-meta" style={{ margin: 0 }}>Reminders before regular medicines run out</p></div></Link>
      </div>
      <div className="section-title" style={{ marginTop: 16 }}>Medicine orders</div>
      {error && <div className="notice">{error}</div>}
      {note && <div className="notice good" role="status">{note}</div>}
      {orders.length === 0 && <p className="muted">No orders yet. <Link href="/pharmacy" style={{ color: 'var(--brand)' }}>Order medicines →</Link></p>}
      <div className="grid cards">
        {orders.map((o) => (
          <Link key={o._id} href={`/orders/${o._id}`} className="card">
            <div className="row"><h3>#{o.orderNumber}</h3><span className="pill">{o.status}</span></div>
            {o.deliveryOtp?.code && !o.deliveryOtp.verifiedAt && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status) && (
              <span className="muted">Delivery code <b style={{ letterSpacing: 3 }}>{o.deliveryOtp.code}</b></span>
            )}
            <span className="muted">{o.items.length} item(s) · ₹{o.amounts.total} · {o.paymentMode === 'PREPAID' && ['PENDING', 'FAILED'].includes(o.paymentStatus) && o.status === 'PLACED' ? 'Awaiting payment' : o.paymentMode}</span>
            {o.status === 'DELIVERED' && o.fulfilment !== 'STAFF_PICKUP' && (
              <button type="button" className="btn secondary" style={{ justifySelf: 'start' }} onClick={(e) => { e.preventDefault(); api.createRefill(o._id, 30).then(() => setNote('Reminder set: we’ll remind you before these run out (every 30 days). Change it in Medicine refills.')).catch((err) => setNote(err instanceof Error ? err.message : 'Could not set the reminder')); }}>Remind Me to Reorder</button>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
