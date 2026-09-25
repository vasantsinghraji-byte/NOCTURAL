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
      <div className="section-title" style={{ marginTop: 16 }}>Your orders</div>
      {error && <div className="notice">{error}</div>}
      {orders.length === 0 && <p className="muted">No orders yet. <Link href="/pharmacy" style={{ color: 'var(--brand)' }}>Order medicines →</Link></p>}
      <div className="grid cards">
        {orders.map((o) => (
          <Link key={o._id} href={`/orders/${o._id}`} className="card">
            <div className="row"><h3>#{o.orderNumber}</h3><span className="pill">{o.status}</span></div>
            {o.deliveryOtp?.code && !o.deliveryOtp.verifiedAt && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status) && (
              <span className="muted">Delivery code <b style={{ letterSpacing: 3 }}>{o.deliveryOtp.code}</b></span>
            )}
            <span className="muted">{o.items.length} item(s) · ₹{o.amounts.total} · {o.paymentMode === 'PREPAID' && ['PENDING', 'FAILED'].includes(o.paymentStatus) && o.status === 'PLACED' ? 'Awaiting payment' : o.paymentMode}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
