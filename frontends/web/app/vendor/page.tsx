'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AuthUser, PharmacyOrder, PharmacyOrderStatus, PharmacyRejectionReason } from '@medrush/shared';

// Vendor-driven next-status options, matching the backend transition map.
const NEXT_STATUS: Partial<Record<PharmacyOrderStatus, PharmacyOrderStatus[]>> = {
  PLACED: ['ACCEPTED'],
  ACCEPTED: ['PREPARING'],
  PREPARING: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED']
};

// Stock/capacity reasons send the order to another store; prescription ones cancel it.
const DECLINE_REASONS: Array<{ code: PharmacyRejectionReason; label: string }> = [
  { code: 'OUT_OF_STOCK', label: 'None of it in stock' },
  { code: 'STORE_BUSY', label: 'Too busy' },
  { code: 'STORE_CLOSED', label: 'Closed now' },
  { code: 'PRESCRIPTION_INVALID', label: 'Prescription not valid' },
  { code: 'OTHER', label: 'Other' }
];
const CAN_DECLINE: PharmacyOrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING'];
const CAN_EDIT_ITEMS: PharmacyOrderStatus[] = ['PLACED', 'ACCEPTED'];

function Countdown({ acceptBy }: { acceptBy?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!acceptBy) return null;
  const left = Math.max(0, Math.round((new Date(acceptBy).getTime() - now) / 1000));
  return (
    <span className={`pill ${left <= 30 ? 'rx' : ''}`} style={left > 30 ? { background: 'var(--amber-soft)', color: 'var(--amber)' } : undefined}>
      {left > 0 ? `Accept within ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Moving to another store…'}
    </span>
  );
}

export default function VendorDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
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

  // New orders and reassignments arrive without a page refresh.
  useEffect(() => {
    if (user?.role !== 'pharmacy_vendor') return undefined;
    const t = setInterval(loadOrders, 15000);
    return () => clearInterval(t);
  }, [user?.role, loadOrders]);

  async function run(id: string, action: () => Promise<unknown>, done?: string) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      if (done) setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update order');
    } finally {
      setBusyId(null);
      await loadOrders();
    }
  }

  function decline(o: PharmacyOrder, code: PharmacyRejectionReason) {
    setDeclining(null);
    const status: PharmacyOrderStatus = o.status === 'PLACED' ? 'REJECTED' : 'CANCELLED';
    // "None in stock" also zeroes these counts so the next customer isn't sent here.
    const ids = code === 'OUT_OF_STOCK'
      ? o.items.filter((it) => (it.status || 'AVAILABLE') === 'AVAILABLE').map((it) => it.medicine)
      : [];
    run(o._id, () => api.vendorUpdateOrderStatus(o._id, status, undefined, { reasonCode: code, unavailableMedicineIds: ids }),
      code === 'PRESCRIPTION_INVALID' ? 'Order cancelled and refunded.' : 'Order passed to another pharmacy.');
  }

  function markMissing(o: PharmacyOrder, medicineId: string, name: string) {
    if (!window.confirm(`Remove ${name}? The customer is refunded for it and your stock for it is set to 0.`)) return;
    run(o._id, () => api.vendorMarkItemsUnavailable(o._id, [medicineId]), `${name} removed.`);
  }

  async function confirmStock() {
    if (!window.confirm('Confirm your shelf matches the stock counts in Nabz? Stores with fresh counts rank higher.')) return;
    try {
      const res = await api.vendorConfirmInventory();
      setNotice(`Confirmed ${res.confirmed} item(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm stock');
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
      <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
        <div className="section-title" style={{ margin: 0 }}>{user.name}: orders</div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn secondary" onClick={confirmStock}>Confirm stock counts</button>
          <button className="btn secondary" onClick={loadOrders}>Refresh</button>
        </div>
      </div>
      {error && <div className="notice bad" style={{ marginTop: 10 }}>{error}</div>}
      {notice && <div className="notice good" style={{ marginTop: 10 }}>{notice}</div>}
      {loading && orders.length === 0 && <p className="muted">Loading orders…</p>}
      {!loading && orders.length === 0 && <p className="muted">No orders yet.</p>}

      <div className="grid cards" style={{ marginTop: 12 }}>
        {orders.map((o) => {
          const busy = busyId === o._id;
          const editable = CAN_EDIT_ITEMS.includes(o.status);
          return (
            <div key={o._id} className="card" style={o.status === 'PLACED' ? { borderColor: 'var(--brand)', borderWidth: 2 } : undefined}>
              <div className="row">
                <h3>#{o.orderNumber}</h3>
                <span className="pill">{o.status.replace(/_/g, ' ')}</span>
              </div>
              {o.status === 'PLACED' && <div style={{ margin: '4px 0' }}><Countdown acceptBy={o.acceptBy} /></div>}
              <span className="muted">₹{o.amounts.total} · {o.paymentMode === 'COD' ? 'Cash on delivery' : `Paid online (${o.paymentStatus})`}</span>
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
              <ul style={{ margin: '8px 0', paddingLeft: 0, listStyle: 'none' }}>
                {o.items.map((it, i) => {
                  const gone = it.status === 'UNAVAILABLE';
                  return (
                    <li key={i} className="row" style={{ padding: '3px 0' }}>
                      <span className="muted" style={gone ? { textDecoration: 'line-through' } : undefined}>{it.quantity} × {it.name}: ₹{it.lineTotal}</span>
                      {gone ? <span className="pill rx">Removed</span> : editable ? (
                        <button className="linkish" style={{ color: 'var(--rose-ink)', fontSize: 12 }} disabled={busy} onClick={() => markMissing(o, it.medicine, it.name)}>
                          Not available
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {declining === o._id ? (
                <div className="stack" style={{ gap: 6 }}>
                  <b>{o.status === 'PLACED' ? 'Why reject?' : "Why can't you fulfil it?"}</b>
                  <span className="muted">Missing just some items? Use &quot;Not available&quot; on those instead.</span>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                    {DECLINE_REASONS.map((r) => (
                      <button key={r.code} className="btn secondary" disabled={busy} onClick={() => decline(o, r.code)}>{r.label}</button>
                    ))}
                    <button className="linkish" onClick={() => setDeclining(null)}>Back</button>
                  </div>
                </div>
              ) : (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                  {(NEXT_STATUS[o.status] || []).map((s) => (
                    <button key={s} className="btn" disabled={busy} onClick={() => run(o._id, () => api.vendorUpdateOrderStatus(o._id, s))}>
                      {s === 'ACCEPTED' ? 'Accept' : s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                    </button>
                  ))}
                  {CAN_DECLINE.includes(o.status) && (
                    <button className="btn secondary" disabled={busy} onClick={() => setDeclining(o._id)}>
                      {o.status === 'PLACED' ? 'Reject' : "Can't fulfil"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
