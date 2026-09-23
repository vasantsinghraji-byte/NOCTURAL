'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { saveDeliveryCoords } from '@/lib/location';
import type { PharmacyVendor, Serviceability, StorefrontItem } from '@medrush/shared';

// Fallback location (C-Scheme, Jaipur: launch city) if the browser denies geolocation —
// matches the demo seed data so the storefront isn't empty during development.
const FALLBACK = { lat: 26.9110, lng: 75.8010 };

export default function PharmacyPage() {
  const cart = useCart();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [vendors, setVendors] = useState<PharmacyVendor[]>([]);
  const [serviceability, setServiceability] = useState<Serviceability | null>(null);
  const [activeVendor, setActiveVendor] = useState<PharmacyVendor | null>(null);
  const [items, setItems] = useState<StorefrontItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(FALLBACK);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const real = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        saveDeliveryCoords(real); // only a real fix becomes the delivery point
        setCoords(real);
      },
      () => setCoords(FALLBACK),
      { timeout: 5000 }
    );
  }, []);

  const loadVendors = useCallback(async (c: { lat: number; lng: number }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getNearbyVendors({ ...c, radiusKm: 10 });
      setVendors(res.vendors);
      setServiceability(res.serviceability);
      if (res.vendors[0]) selectVendor(res.vendors[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pharmacies');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (coords) loadVendors(coords);
  }, [coords, loadVendors]);

  async function selectVendor(v: PharmacyVendor) {
    setActiveVendor(v);
    setItems([]);
    try {
      const res = await api.getVendorStorefront(v._id);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load storefront');
    }
  }

  const qtyOf = (id: string) => cart.lines[id]?.qty || 0;

  return (
    <>
      <div className="row" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ margin: 0 }}>Pharmacy near you</div>
        {cart.count > 0
          ? <Link href="/checkout" className="btn">{cart.count} item(s) · ₹{cart.subtotal} — Checkout</Link>
          : <span className="pill">Cart empty</span>}
      </div>

      {error && <div className="notice" style={{ marginTop: 10 }}>{error}</div>}
      {loading && <p className="muted">Finding pharmacies near you…</p>}

      {serviceability && serviceability.stressLevel !== 'NORMAL' && vendors.length > 0 && (
        <div className="notice" style={{ marginTop: 10 }}>High demand in your area — showing the stores that can still reach you quickly.</div>
      )}

      {!loading && vendors.length === 0 && (
        <div className="notice">
          {serviceability?.reason === 'ZONE_PAUSED'
            ? 'Deliveries to your area are paused right now. Please check back soon.'
            : 'No pharmacy delivers to your location yet.'}
        </div>
      )}

      {vendors.length > 0 && (
        <>
          <div className="grid cards" style={{ marginBottom: 10 }}>
            {vendors.map((v) => (
              <button
                key={v._id}
                className="card"
                style={{ textAlign: 'left', borderColor: activeVendor?._id === v._id ? 'var(--brand)' : 'var(--border)', cursor: 'pointer' }}
                onClick={() => selectVendor(v)}
              >
                <h3>{v.name}</h3>
                <span className="muted">
                  {v.distanceKm !== undefined ? `${v.distanceKm} km · ` : ''}
                  {v.eta ? `~${Math.max(1, Math.round((new Date(v.eta.promisedAt).getTime() - Date.now()) / 60000))} min · ` : ''}
                  delivery ₹{v.deliveryFee ?? 0}
                </span>
              </button>
            ))}
          </div>

          {activeVendor && (
            <>
              <div className="section-title">{activeVendor.name} — catalog</div>
              <div className="grid cards">
                {items.map((it) => {
                  const qty = qtyOf(it.medicine._id);
                  return (
                    <div key={it.inventoryId} className="card">
                      <div className="row">
                        <h3>{it.medicine.name}</h3>
                        {it.medicine.requiresPrescription
                          ? <span className="pill rx">Rx</span>
                          : <span className="pill">OTC</span>}
                      </div>
                      <span className="muted">{it.medicine.packSize || it.medicine.form}</span>
                      <div className="row" style={{ marginTop: 10 }}>
                        <div>
                          <span className="price">₹{it.sellingPrice}</span>
                          {it.mrp > it.sellingPrice && <span className="strike">₹{it.mrp}</span>}
                        </div>
                        {qty === 0 ? (
                          <button
                            className="btn"
                            disabled={!it.inStock}
                            onClick={() => activeVendor && cart.add(activeVendor._id, activeVendor.name, it)}
                          >
                            {it.inStock ? 'Add' : 'Out of stock'}
                          </button>
                        ) : (
                          <div className="row" style={{ gap: 8 }}>
                            <button className="btn secondary" onClick={() => cart.decrement(it.medicine._id)}>−</button>
                            <b>{qty}</b>
                            <button className="btn" onClick={() => activeVendor && cart.add(activeVendor._id, activeVendor.name, it)}>+</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
