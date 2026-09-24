'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { payForOrder } from '@/lib/razorpay';
import { loadDeliveryCoords } from '@/lib/location';
import type { PaymentOptions } from '@medrush/shared';

type PayMode = 'PREPAID' | 'COD';

export default function CheckoutPage() {
  const { patient, loading } = useAuth();
  const cart = useCart();
  const router = useRouter();

  const [addr, setAddr] = useState({ line1: '', line2: '', city: '', state: '', pincode: '', contactPhone: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payOptions, setPayOptions] = useState<PaymentOptions | null>(null);
  const [mode, setMode] = useState<PayMode>('COD');

  // Offer online payment only when the backend has Razorpay configured.
  useEffect(() => {
    api.getPaymentOptions()
      .then((opts) => {
        setPayOptions(opts);
        if (opts.online) setMode('PREPAID');
      })
      .catch(() => setPayOptions(null));
  }, []);

  // Prefill address from the patient's default saved address / primary address.
  useEffect(() => {
    if (!patient) return;
    const def = patient.savedAddresses?.find((a) => a.isDefault) || patient.savedAddresses?.[0] || patient.address;
    if (def) {
      setAddr((prev) => ({
        ...prev,
        line1: def.street || '',
        city: def.city || '',
        state: def.state || '',
        pincode: def.pincode || '',
        contactPhone: patient.phone || ''
      }));
    } else {
      setAddr((prev) => ({ ...prev, contactPhone: patient.phone || '' }));
    }
  }, [patient]);

  const lines = useMemo(() => Object.values(cart.lines), [cart.lines]);
  const set = (k: keyof typeof addr) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddr((a) => ({ ...a, [k]: e.target.value }));

  if (loading) return <p className="muted" style={{ marginTop: 20 }}>Loading…</p>;

  if (!patient) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Please log in to checkout</h2>
        <Link href="/login?next=/checkout" className="btn">Login to continue</Link>
      </div>
    );
  }

  if (cart.count === 0 || !cart.vendorId) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Your cart is empty</h2>
        <Link href="/pharmacy" className="btn">Browse pharmacies</Link>
      </div>
    );
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cart.hasRx && !file) {
      setError('This cart contains prescription medicines — please upload a prescription.');
      return;
    }
    setBusy(true);
    try {
      let prescriptionKey: string | undefined;
      if (file) {
        const up = await api.uploadPrescription(file, file.name);
        prescriptionKey = up.key;
      }
      const res = await api.createOrder({
        vendorId: cart.vendorId!,
        items: lines.map((l) => ({ medicineId: l.medicineId, quantity: l.qty })),
        deliveryAddress: {
          line1: addr.line1,
          line2: addr.line2 || undefined,
          city: addr.city,
          state: addr.state,
          pincode: addr.pincode,
          contactPhone: addr.contactPhone
        },
        prescriptionKey,
        // The API refuses the order if the store changed a price since it was added.
        quotedSubtotal: cart.subtotal,
        // Lets the API confirm the store delivers here and promise an ETA.
        deliveryLocation: (() => {
          const c = loadDeliveryCoords();
          return c ? { coordinates: [c.lng, c.lat] as [number, number] } : undefined;
        })(),
        paymentMode: mode
      });
      cart.clear();
      const orderId = res.order._id;
      if (mode === 'PREPAID') {
        // Stock is reserved; if the modal is closed the order page offers "Pay now".
        try {
          await payForOrder(orderId, { name: patient!.name, email: patient!.email, contact: addr.contactPhone });
        } catch {
          /* handled on the order page */
        }
      }
      router.replace(`/orders/${orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place order');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title" style={{ marginTop: 16 }}>Checkout — {cart.vendorName}</div>

      <div className="card" style={{ marginBottom: 12 }}>
        {lines.map((l) => (
          <div key={l.medicineId} className="row" style={{ padding: '4px 0' }}>
            <span>{l.qty} × {l.name} {l.requiresPrescription && <span className="pill rx">Rx</span>}</span>
            <span className="price">₹{l.qty * l.sellingPrice}</span>
          </div>
        ))}
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
        <div className="row"><b>Subtotal</b><b>₹{cart.subtotal}</b></div>
      </div>

      <form className="card" onSubmit={placeOrder}>
        <h3 style={{ marginTop: 0 }}>Delivery address</h3>
        <label>Address line 1</label>
        <input className="input" value={addr.line1} onChange={set('line1')} required />
        <label>Address line 2 (optional)</label>
        <input className="input" value={addr.line2} onChange={set('line2')} />
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>City</label><input className="input" value={addr.city} onChange={set('city')} required /></div>
          <div><label>State</label><input className="input" value={addr.state} onChange={set('state')} required /></div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Pincode</label><input className="input" inputMode="numeric" pattern="[0-9]{6}" value={addr.pincode} onChange={set('pincode')} required /></div>
          <div><label>Contact phone</label><input className="input" value={addr.contactPhone} onChange={set('contactPhone')} required /></div>
        </div>

        {cart.hasRx && (
          <>
            <label>Prescription (required for Rx items) — image or PDF</label>
            <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </>
        )}

        <h3 style={{ marginBottom: 6 }}>Payment</h3>
        {payOptions?.online ? (
          <div role="radiogroup" aria-label="Payment method">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 'normal' }}>
              <input type="radio" name="paymode" checked={mode === 'PREPAID'} onChange={() => setMode('PREPAID')} />
              Pay online — UPI, cards, netbanking (Razorpay)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 'normal' }}>
              <input type="radio" name="paymode" checked={mode === 'COD'} onChange={() => setMode('COD')} />
              Cash on delivery
            </label>
            {mode === 'PREPAID' && (
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                Your items are held for {payOptions.paymentWindowMinutes} minutes while you pay. The pharmacy sees the order once payment succeeds.
              </p>
            )}
          </div>
        ) : (
          <div className="notice"><b>Cash on delivery</b>. Online payment is not available right now.</div>
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 14, width: '100%' }}>
          {busy ? (mode === 'PREPAID' ? 'Processing payment…' : 'Placing order…')
            : mode === 'PREPAID' ? `Continue to payment · ₹${cart.subtotal}` : `Place order · ₹${cart.subtotal}`}
        </button>
      </form>
    </>
  );
}
