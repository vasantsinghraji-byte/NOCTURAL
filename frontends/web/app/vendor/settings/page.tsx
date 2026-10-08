'use client';

import { useEffect, useState } from 'react';
import type { StoreDay, StoreHours, StoreProfile } from '@medrush/shared';
import { api } from '@/lib/api';
import { problem } from '@/lib/care';
import VendorShell from '../VendorShell';

const DAYS: Array<{ day: StoreDay; label: string }> = [
  { day: 'MON', label: 'Monday' }, { day: 'TUE', label: 'Tuesday' }, { day: 'WED', label: 'Wednesday' }, { day: 'THU', label: 'Thursday' },
  { day: 'FRI', label: 'Friday' }, { day: 'SAT', label: 'Saturday' }, { day: 'SUN', label: 'Sunday' }
];
const RADII = [2, 3, 5, 8, 10, 15];
const PACKING = [10, 15, 20, 30, 45];

/** Shop settings: open switch, hours, delivery area and fees, packing time, contact. */
export default function VendorSettingsPage() {
  return <VendorShell>{() => <Settings />}</VendorShell>;
}

function Settings() {
  const [shop, setShop] = useState<StoreProfile | null>(null);
  const [hours, setHours] = useState<StoreHours[]>([]);
  const [radius, setRadius] = useState(5);
  const [fee, setFee] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [packing, setPacking] = useState(15);
  const [rx, setRx] = useState(true);
  const [open, setOpen] = useState(true);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.vendorProfile().then(({ vendor: v }) => {
      setShop(v);
      setHours(DAYS.map(({ day }) => v.operatingHours.find((h) => h.day === day) || { day, open: '09:00', close: '21:00', isClosed: false }));
      setRadius(v.serviceRadiusKm); setFee(String(v.deliveryFee)); setMinOrder(String(v.minOrderValue)); setPacking(v.avgPreparationMinutes);
      setRx(v.acceptsPrescriptionOrders); setOpen(v.isOpen); setPhone(v.contactPhone); setEmail(v.contactEmail);
    }).catch((e) => setErr(problem(e).message));
  }, []);

  const setDay = (day: StoreDay, patch: Partial<StoreHours>) => { setSaved(false); setHours((hs) => hs.map((h) => (h.day === day ? { ...h, ...patch } : h))); };
  const copyMonday = () => { const mon = hours.find((h) => h.day === 'MON'); if (mon) setHours((hs) => hs.map((h) => ({ ...mon, day: h.day }))); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad = hours.find((h) => !h.isClosed && (!h.open || !h.close));
    if (bad) return setErr(`Set ${DAYS.find((d) => d.day === bad.day)?.label}'s opening and closing time, or mark it closed.`);
    const f = Number(fee || 0); const m = Number(minOrder || 0);
    if (!(f >= 0 && f <= 200)) return setErr('Delivery fee must be ₹0 to ₹200');
    if (!(m >= 0 && m <= 5000)) return setErr('Minimum order must be ₹0 to ₹5000');
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return setErr('Enter a 10-digit mobile number');
    setBusy(true); setErr(''); setSaved(false);
    try {
      const r = await api.vendorUpdateProfile({
        isOpen: open, operatingHours: hours, ...(radius !== shop?.serviceRadiusKm ? { serviceRadiusKm: radius } : {}), deliveryFee: f, minOrderValue: m,
        avgPreparationMinutes: packing, acceptsPrescriptionOrders: rx, contactPhone: phone, contactEmail: email.trim()
      });
      setShop(r.vendor);
      setSaved(true);
    } catch (e2) { setErr(problem(e2).message); } finally { setBusy(false); }
  }

  if (!shop) return err ? <p className="mk-error" role="alert" style={{ marginTop: 16 }}>{err}</p> : <div className="mk-skel" style={{ marginTop: 16 }} />;

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 14, marginTop: 8, maxWidth: 760 }}>
      <h1 className="mk-h2" style={{ margin: 0 }}>Shop settings</h1>

      <label className="mk-card mk-row" style={{ cursor: 'pointer' }}>
        <span className="grow">
          <span className="mk-title" style={{ display: 'block' }}>{open ? 'Shop is open' : 'Shop is closed'}</span>
          <span className="mk-meta">Close it for a holiday or when you’re too busy. Your hours below still apply when it’s open.</span>
        </span>
        <input type="checkbox" role="switch" checked={open} onChange={(e) => setOpen(e.target.checked)} style={{ width: 24, height: 24 }} aria-label="Shop open" />
      </label>

      <fieldset className="mk-card" style={{ display: 'grid', gap: 8, margin: 0 }}>
        <legend className="mk-title" style={{ padding: '0 6px' }}>Opening hours</legend>
        {hours.map((h) => {
          const label = DAYS.find((d) => d.day === h.day)?.label;
          return (
            <div key={h.day} className="mk-row" style={{ flexWrap: 'wrap', gap: 10, minHeight: 50, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <b style={{ width: 100 }}>{label}</b>
              <label className="mk-row" style={{ gap: 6 }}>
                <input type="checkbox" checked={!h.isClosed} onChange={(e) => setDay(h.day, { isClosed: !e.target.checked })} style={{ width: 18, height: 18 }} /> Open
              </label>
              {h.isClosed ? <span className="mk-meta">Closed all day</span> : (
                <span className="mk-row" style={{ gap: 6 }}>
                  <input type="time" className="mk-input" style={{ width: 130 }} value={h.open || ''} onChange={(e) => setDay(h.day, { open: e.target.value })} aria-label={`${label} opens at`} />
                  <span className="mk-meta">to</span>
                  <input type="time" className="mk-input" style={{ width: 130 }} value={h.close || ''} onChange={(e) => setDay(h.day, { close: e.target.value })} aria-label={`${label} closes at`} />
                </span>
              )}
            </div>
          );
        })}
        <div><button type="button" className="mk-btn small ghost" onClick={copyMonday}>Use Monday’s hours every day</button></div>
      </fieldset>

      <fieldset className="mk-card" style={{ display: 'grid', gap: 14, margin: 0 }}>
        <legend className="mk-title" style={{ padding: '0 6px' }}>Delivery</legend>
        <div className="mk-field">
          <span className="mk-label" id="radius-label">How far you deliver</span>
          <div className="mk-chips" role="group" aria-labelledby="radius-label">
            {RADII.map((r) => <button key={r} type="button" className="mk-chip" aria-pressed={radius === r} onClick={() => setRadius(r)}>{r} km</button>)}
          </div>
        </div>
        <div className="mk-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <label className="mk-field" style={{ flex: 1, minWidth: 160 }}>
            <span className="mk-label">Delivery fee (₹)</span>
            <input className="mk-input" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
          <label className="mk-field" style={{ flex: 1, minWidth: 160 }}>
            <span className="mk-label">Minimum order (₹)</span>
            <input className="mk-input" inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
          </label>
        </div>
        <div className="mk-field">
          <span className="mk-label" id="packing-label">Time to pack an order</span>
          <div className="mk-chips" role="group" aria-labelledby="packing-label">
            {PACKING.map((p) => <button key={p} type="button" className="mk-chip" aria-pressed={packing === p} onClick={() => setPacking(p)}>{p} min</button>)}
          </div>
        </div>
        <label className="mk-row" style={{ gap: 10 }}>
          <input type="checkbox" checked={rx} onChange={(e) => setRx(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span><b>Take prescription orders</b><br /><span className="mk-meta">Needs a pharmacist to check each prescription.</span></span>
        </label>
      </fieldset>

      <fieldset className="mk-card" style={{ display: 'grid', gap: 10, margin: 0 }}>
        <legend className="mk-title" style={{ padding: '0 6px' }}>Contact</legend>
        <label className="mk-field">
          <span className="mk-label">Shop phone</span>
          <input className="mk-input" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))} placeholder="10-digit mobile…" />
        </label>
        <label className="mk-field">
          <span className="mk-label">Shop email</span>
          <input className="mk-input" type="email" autoComplete="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {shop.address?.line1 && <p className="mk-meta" style={{ margin: 0 }}>Address: {[shop.address.line1, shop.address.city, shop.address.pincode].filter(Boolean).join(', ')}. To change it, contact Nabz support.</p>}
      </fieldset>

      {err && <p className="mk-error" role="alert">{err}</p>}
      {saved && <p className="mk-note green" role="status" aria-live="polite">Saved. Customers see your new settings right away.</p>}
      <div><button type="submit" className="mk-btn" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  );
}
