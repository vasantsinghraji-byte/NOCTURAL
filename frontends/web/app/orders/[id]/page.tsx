'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { payForOrder, PaymentDismissedError } from '@/lib/razorpay';
import type { PharmacyOrder } from '@medrush/shared';

const STEPS = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const CANCELLABLE = ['PLACED', 'ACCEPTED'];

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: 'Awaiting payment',
  FAILED: 'Payment failed',
  PAID: 'Paid online',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded'
};

const awaitingPayment = (o: PharmacyOrder) =>
  o.paymentMode === 'PREPAID' && ['PENDING', 'FAILED'].includes(o.paymentStatus) && o.status === 'PLACED';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [order, setOrder] = useState<PharmacyOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const { patient } = useAuth();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.getOrder(id);
      setOrder(res.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load order');
    }
  }, [id]);

  useEffect(() => {
    load();
    // Poll for live status until the order reaches a terminal state.
    const t = setInterval(() => {
      setOrder((cur) => {
        if (cur && ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(cur.status)) return cur;
        load();
        return cur;
      });
    }, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function cancel() {
    if (!id) return;
    setCancelling(true);
    try {
      await api.cancelOrder(id, 'Cancelled from web');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  }

  async function pay() {
    if (!id) return;
    setPaying(true);
    setPayError(null);
    try {
      const paid = await payForOrder(id, { name: patient?.name, email: patient?.email, contact: order?.deliveryAddress?.contactPhone });
      setOrder(paid);
    } catch (e) {
      if (!(e instanceof PaymentDismissedError)) {
        setPayError(e instanceof Error ? e.message : 'Payment could not be completed');
      }
      await load();
    } finally {
      setPaying(false);
    }
  }

  if (error) return <div className="notice" style={{ marginTop: 20 }}>{error} <div style={{ marginTop: 8 }}><Link href="/orders" className="btn secondary">Back to orders</Link></div></div>;
  if (!order) return <p className="muted" style={{ marginTop: 20 }}>Loading order…</p>;

  const terminal = ['CANCELLED', 'REJECTED'].includes(order.status);
  const stepIndex = STEPS.indexOf(order.status);

  return (
    <>
      <div className="row" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ margin: 0 }}>Order #{order.orderNumber}</div>
        <span className="pill status-badge">{order.status}</span>
      </div>

      {order.deliveryOtp?.code && !order.deliveryOtp.verifiedAt && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(order.status) && (
        <div className="notice" style={{ marginTop: 10 }}>
          Delivery code <b style={{ fontSize: 22, letterSpacing: 4, marginLeft: 8 }}>{order.deliveryOtp.code}</b>
          <div className="muted">Share it with the delivery person only when you receive your medicines.</div>
        </div>
      )}

      {awaitingPayment(order) && (
        <div className="notice" style={{ marginTop: 10 }}>
          <b>{order.paymentStatus === 'FAILED' ? 'Your last payment attempt failed.' : 'Complete payment to send this order to the pharmacy.'}</b>
          {order.paymentExpiresAt && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Items are held until {new Date(order.paymentExpiresAt).toLocaleTimeString()}; unpaid orders are cancelled after that.
            </div>
          )}
          {payError && <div className="error">{payError}</div>}
          <button className="btn" onClick={pay} disabled={paying} style={{ marginTop: 10 }}>
            {paying ? 'Opening payment…' : `Pay now · ₹${order.amounts.total}`}
          </button>
        </div>
      )}

      {!terminal && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {STEPS.map((s, i) => (
              <span key={s} className="pill" style={{ background: i <= stepIndex ? 'var(--brand)' : '#eef1f5', color: i <= stepIndex ? '#fff' : 'var(--muted)' }}>
                {s.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {order.eta?.promisedAt && !terminal && order.status !== 'DELIVERED' && (
        <p className="muted" style={{ margin: '10px 0 0' }}>
          Expected by <b>{new Date(order.eta.promisedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
          {order.distanceKm !== undefined ? ` · ${order.distanceKm} km away` : ''}
        </p>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Items</h3>
        {order.items.map((it, i) => (
          <div key={i} className="row" style={{ padding: '3px 0' }}>
            <span className="muted">{it.quantity} × {it.name}</span>
            <span>₹{it.lineTotal}</span>
          </div>
        ))}
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
        <div className="row"><b>Total ({order.paymentMode})</b><b>₹{order.amounts.total}</b></div>
        {order.paymentMode === 'PREPAID' && (
          <div className="row" style={{ marginTop: 6 }}>
            <span className="muted">Payment</span>
            <span className="pill">{PAYMENT_LABEL[order.paymentStatus] || order.paymentStatus}</span>
          </div>
        )}
        {terminal && order.cancellationReason && (
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Reason: {order.cancellationReason}</p>
        )}
      </div>

      {order.timeline && order.timeline.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Timeline</h3>
          <ul className="timeline">
            {order.timeline.map((t, i) => (
              <li key={i}>
                <span className="status-badge">{t.status.replace(/_/g, ' ')}</span>
                <span className="when">{new Date(t.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        <Link href="/orders" className="btn secondary">Back to orders</Link>
        {CANCELLABLE.includes(order.status) && (
          <button className="btn secondary" onClick={cancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel order'}
          </button>
        )}
      </div>
    </>
  );
}
