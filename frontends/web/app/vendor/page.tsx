'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AuthUser, PharmacyOrder, PharmacyOrderStatus } from '@medrush/shared';

// Vendor-driven next-status options, matching the backend transition map.
const NEXT_STATUS: Partial<Record<PharmacyOrderStatus, PharmacyOrderStatus[]>> = {
  PLACED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PREPARING'],
  PREPARING: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED']
};

export default function VendorDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.vendorListOrders({ limit: 50 });
      setOrders(res.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.staffMe()
      .then((res) => {
        setUser(res.user);
        if (res.user.role === 'pharmacy_vendor') loadOrders();
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [loadOrders]);

  async function update(id: string, status: PharmacyOrderStatus) {
    try {
      await api.vendorUpdateOrderStatus(id, status);
      await loadOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update order');
    }
  }

  if (checking) return <p className="muted" style={{ marginTop: 20 }}>Checking session…</p>;

  if (!user || user.role !== 'pharmacy_vendor') {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Vendor dashboard</h2>
        <p className="muted">{user ? `Logged in as ${user.role}, not a vendor.` : 'Please log in as a pharmacy vendor.'}</p>
        <Link href="/vendor/login" className="btn">Vendor login</Link>
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ margin: 0 }}>{user.name} — orders</div>
        <button className="btn secondary" onClick={loadOrders}>Refresh</button>
      </div>
      {error && <div className="notice">{error}</div>}
      {loading && <p className="muted">Loading orders…</p>}
      {!loading && orders.length === 0 && <p className="muted">No orders yet.</p>}

      <div className="grid cards" style={{ marginTop: 12 }}>
        {orders.map((o) => (
          <div key={o._id} className="card">
            <div className="row">
              <h3>#{o.orderNumber}</h3>
              <span className="pill">{o.status}</span>
            </div>
            <span className="muted">{o.items.length} item(s) · ₹{o.amounts.total} · {o.paymentMode}</span>
            {o.fulfilment === 'STAFF_PICKUP' && (
              <div className="notice" style={{ marginTop: 6, background: 'var(--violet-soft)', borderColor: 'transparent' }}>
                <b>Nurse pickup</b> for a home visit
                {o.careVisit ? ` on ${String(o.careVisit.scheduledDate).slice(0, 10)} at ${o.careVisit.scheduledTime}` : ''}. Pack it and hand it to the nurse.
              </div>
            )}
            {o.requiresPrescription && (
              <div style={{ marginTop: 4 }}>
                <span className="pill rx">Rx</span>{' '}
                {o.prescription?.key && <a href={api.prescriptionLink(o._id, 'vendor')} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>View prescription</a>}
              </div>
            )}
            <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
              {o.items.map((it, i) => (
                <li key={i} className="muted">{it.quantity} × {it.name} — ₹{it.lineTotal}</li>
              ))}
            </ul>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {(NEXT_STATUS[o.status] || []).map((s) => (
                <button key={s} className={s === 'REJECTED' ? 'btn secondary' : 'btn'} onClick={() => update(o._id, s)}>
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
