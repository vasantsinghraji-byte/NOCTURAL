'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CareBooking, CareService, CareSuppliesQuote, CareSupplySource } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadDeliveryCoords, saveDeliveryCoords, type Coords } from '@/lib/location';
import { CircleCheck, MapPin, Store } from 'lucide-react';
import { IconTile, serviceIcon, TONES } from '../_components/icons';

const DEMO_COORDS: Coords = { lat: 26.9110, lng: 75.8010 }; // launch city demo area (C-Scheme, Jaipur)

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const inr = (n: number) => `₹${Math.round(n * 100) / 100}`;

export default function NursingPage() {
  const { patient } = useAuth();
  const [services, setServices] = useState<CareService[]>([]);
  const [serviceType, setServiceType] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [quote, setQuote] = useState<CareSuppliesQuote | null>(null);
  const [choices, setChoices] = useState<Record<string, CareSupplySource>>({});
  const [form, setForm] = useState({
    date: tomorrow(), time: '10:00', street: '', city: 'Jaipur', pincode: '',
    name: '', age: '', gender: 'Female' as 'Male' | 'Female' | 'Other', notes: ''
  });
  const [rxFile, setRxFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CareBooking | null>(null);
  const [myVisits, setMyVisits] = useState<CareBooking[]>([]);
  const [isMember, setIsMember] = useState(false);
  useEffect(() => { if (patient) api.getMembership().then((m) => setIsMember(m.active)).catch(() => undefined); }, [patient]);

  const service = services.find((s) => s.serviceType === serviceType) || null;

  useEffect(() => {
    // Preselect the service picked on the home page (/nursing?service=INJECTION).
    const wanted = new URLSearchParams(window.location.search).get('service');
    api.listCareServices().then((r) => {
      setServices(r.services);
      if (wanted && r.services.some((s) => s.serviceType === wanted)) setServiceType(wanted);
    }).catch((e) => setError(e.message));
    const saved = loadDeliveryCoords();
    if (saved) { setCoords(saved); return; }
    if (!navigator.geolocation) { setCoords(DEMO_COORDS); setUsingDemo(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }; saveDeliveryCoords(c); setCoords(c); },
      () => { setCoords(DEMO_COORDS); setUsingDemo(true); },
      { timeout: 8000 }
    );
  }, []);

  const loadVisits = useCallback(() => {
    if (!patient) return;
    api.getMyCareBookings().then((r) => setMyVisits(r.data || r.bookings || [])).catch(() => undefined);
  }, [patient]);
  useEffect(() => { loadVisits(); }, [loadVisits]);

  useEffect(() => {
    if (!serviceType || !coords) return;
    setQuote(null);
    api.quoteCareSupplies({ serviceType, ...coords })
      .then((r) => {
        setQuote(r.quote);
        setChoices(Object.fromEntries(r.quote.items.map((i) => {
          const canBring = i.available && !(i.kind === 'MEDICINE' && !i.medicineId);
          return [i.key, i.defaultSource === 'STAFF_BRINGS' && canBring ? 'STAFF_BRINGS' : 'PATIENT_HAS'];
        })));
      })
      .catch((e) => setError(e.message));
  }, [serviceType, coords]);

  const bringing = useMemo(() => (quote?.items || []).filter((i) => choices[i.key] === 'STAFF_BRINGS'), [quote, choices]);
  const suppliesTotal = bringing.reduce((sum, i) => sum + (i.unitPrice || 0) * i.quantity, 0);
  const needsRx = !!service?.requirements?.prescriptionRequired || bringing.some((i) => i.requiresPrescription);
  // Server-computed price; Nabz Plus members pay no platform fee.
  const preview = service?.pricingPreview ? (isMember ? service.pricingPreview.member : service.pricingPreview.regular) : null;
  const visitFee = preview ? preview.totalAmount : 0;

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !coords) return;
    setBusy(true);
    setError(null);
    try {
      let prescriptionKey: string | undefined;
      let prescriptionUrl: string | undefined;
      if (needsRx) {
        if (!rxFile) throw new Error('Please attach the prescription for this visit.');
        const up = await api.uploadPrescription(rxFile, rxFile.name);
        prescriptionKey = up.key;
        prescriptionUrl = up.url;
      }
      const res = await api.createCareBooking({
        serviceType: service.serviceType,
        scheduledDate: form.date,
        scheduledTime: form.time,
        scheduledTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        scheduledTimezoneOffsetMinutes: -new Date(`${form.date}T${form.time}:00`).getTimezoneOffset(),
        serviceLocation: {
          type: 'HOME',
          address: { street: form.street.trim(), city: form.city.trim(), pincode: form.pincode.trim(), coordinates: coords }
        },
        patientDetails: { name: form.name.trim() || patient?.name || 'Patient', age: Number(form.age), gender: form.gender },
        specialRequirements: form.notes.trim() || undefined,
        supplies: (quote?.items || []).map((i) => ({ key: i.key, source: choices[i.key] })),
        suppliesVendorId: bringing.length ? quote?.vendor?._id : undefined,
        prescriptionKey,
        prescriptionUrl
      });
      setDone(res.booking);
      loadVisits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      // Free until the professional is on the way; a fee after that; not once started.
      const { quote } = await api.getCareCancelQuote(id);
      if (!quote.allowed) { setError(quote.reason || 'This visit has already started and can’t be cancelled.'); return; }
      const msg = quote.fee > 0
        ? `Your professional is already on the way, so a cancellation fee of ${inr(quote.fee)} applies. It will be added to your next booking. Cancel anyway?`
        : 'Cancel this visit? It’s free right now. Any supplies ordered for it will be cancelled too.';
      if (!window.confirm(msg)) return;
      await api.cancelCareBooking(id, 'Cancelled by patient');
      loadVisits();
    } catch (e) { setError((e as Error).message); }
  }

  async function reschedule(id: string) {
    const when = window.prompt('Everyone nearby was busy. Pick another time (YYYY-MM-DD HH:MM):', '');
    if (!when) return;
    const m = when.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})$/);
    if (!m) { setError('Use the format YYYY-MM-DD HH:MM, for example 2026-09-25 18:00'); return; }
    try { await api.rescheduleCareBooking(id, m[1], m[2].padStart(5, '0')); loadVisits(); } catch (e) { setError((e as Error).message); }
  }

  if (done) {
    return (
      <section className="card" style={{ marginTop: 20, textAlign: 'center', padding: 32 }}>
        <IconTile icon={CircleCheck} size={72} round />
        <h2>Visit booked!</h2>
        <p className="muted">
          {service?.displayName} on {form.date} at {form.time}. We&apos;re assigning a verified professional.
        </p>
        {done.supplies?.status === 'ORDERED' && (
          <div className="notice good" style={{ maxWidth: 520, margin: '12px auto' }}>
            <b>{quote?.vendor?.name}</b> is packing your supplies ({inr(done.supplies.amount || 0)}). The nurse will collect them on the way. Pay at the visit.
          </div>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn" onClick={() => { setDone(null); setServiceType(null); }}>Book another</button>
          <Link className="btn secondary" href="/">Home</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="hero" style={{ padding: '32px 28px' }}>
        <span className="eyebrow">Home nursing &amp; physio</span>
        <h1 style={{ fontSize: 'clamp(26px,4vw,40px)' }}>A verified nurse at home. Supplies included if you need them.</h1>
        <p>Pick a service, tell us what you already have, and we&apos;ll bring the rest from the nearest pharmacy.</p>
      </section>

      {error && <div className="notice bad" style={{ marginTop: 16 }}>{error}</div>}
      {usingDemo && <div className="notice" style={{ marginTop: 16 }}><MapPin size={14} style={{ verticalAlign: -2 }} /> Location unavailable, so we&apos;re showing the C-Scheme, Jaipur demo area.</div>}

      <div className="section-title">1 · Choose a service</div>
      <div className="grid cats">
        {services.map((s) => (
          <button key={s.serviceType} type="button" className={`choice ${serviceType === s.serviceType ? 'on' : ''}`}
            onClick={() => setServiceType(s.serviceType)}>
            <IconTile icon={serviceIcon(s.serviceType)} bg={TONES[services.indexOf(s) % TONES.length].bg} color={TONES[services.indexOf(s) % TONES.length].fg} size={48} />
            <h3 style={{ margin: '6px 0 2px' }}>{s.displayName || s.name}</h3>
            <div className="muted">{s.shortDescription}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="price">from ₹{s.pricing.basePrice}</span>
              <span className="pill violet">{s.serviceDetails?.duration ? `${s.serviceDetails.duration} min` : s.category.toLowerCase()}</span>
            </div>
          </button>
        ))}
        {services.length === 0 && !error && <div className="muted">Loading services…</div>}
      </div>

      {service && (
        <form onSubmit={book}>
          <div className="section-title">2 · What do you already have?</div>
          {!quote ? <div className="muted">Checking nearby pharmacies…</div> : quote.items.length === 0 ? (
            <div className="notice good">No supplies needed: the professional brings their own kit.</div>
          ) : (
            <div className="card stack">
              {quote.vendor
                ? <div className="muted"><Store size={14} style={{ verticalAlign: -2 }} /> &quot;Staff brings it&quot; items come from <b>{quote.vendor.name}</b>{quote.vendor.distanceKm !== undefined ? ` (${quote.vendor.distanceKm} km)` : ''}.</div>
                : <div className="notice">No partner pharmacy nearby stocks these right now. Please keep them ready.</div>}
              {quote.items.map((i) => {
                const canBring = i.available && !(i.kind === 'MEDICINE' && !i.medicineId);
                return (
                  <div key={i.key} className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div>
                      <b>{i.name}</b> <span className="muted">× {i.quantity}</span>
                      {i.requiresPrescription && <span className="pill rx" style={{ marginLeft: 6 }}>Rx</span>}
                      <div className="muted">
                        {canBring ? `${i.productName} · ${inr((i.unitPrice || 0) * i.quantity)}` : (i.note || (i.medicineId ? 'Out of stock nearby' : 'You provide this'))}
                      </div>
                    </div>
                    <div className="segmented" role="group" aria-label={`Who provides ${i.name}`}>
                      <button type="button" className={choices[i.key] === 'PATIENT_HAS' ? 'on' : ''}
                        onClick={() => setChoices((c) => ({ ...c, [i.key]: 'PATIENT_HAS' }))}>I have it</button>
                      <button type="button" disabled={!canBring} className={choices[i.key] === 'STAFF_BRINGS' ? 'on' : ''}
                        onClick={() => setChoices((c) => ({ ...c, [i.key]: 'STAFF_BRINGS' }))}>Staff brings</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="section-title">3 · When &amp; where</div>
          <div className="card">
            <div className="grid two">
              <div><label className="muted">Date</label><input className="input" type="date" min={tomorrow()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
              <div><label className="muted">Time</label><input className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required /></div>
              <div><label className="muted">House / street</label><input className="input" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} required placeholder="Flat 4B, 12th Main" /></div>
              <div><label className="muted">City</label><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></div>
              <div><label className="muted">Pincode</label><input className="input" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} required pattern="\d{6}" placeholder="560034" /></div>
              <div><label className="muted">Patient name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={patient?.name || 'Full name'} /></div>
              <div><label className="muted">Age</label><input className="input" type="number" min={0} max={120} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} required /></div>
              <div><label className="muted">Gender</label>
                <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'Male' | 'Female' | 'Other' })}>
                  <option>Female</option><option>Male</option><option>Other</option>
                </select>
              </div>
            </div>
            <label className="muted" style={{ display: 'block', marginTop: 12 }}>Notes for the professional (optional)</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Allergies, floor number, gate code…" />
            {needsRx && (
              <div style={{ marginTop: 12 }}>
                <label className="muted">Prescription (image or PDF) <span className="pill rx">Required</span></label>
                <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => setRxFile(e.target.files?.[0] || null)} />
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 16, position: 'sticky', bottom: 12, boxShadow: 'var(--shadow)' }}>
            <div className="row">
              <div>
                <div><b>{service.displayName}</b> · visit {inr(visitFee)} <span className="muted">({isMember ? 'Plus: no platform fee' : 'incl. fees & GST'})</span></div>
                <div className="muted">Supplies from pharmacy: {inr(suppliesTotal)} · pay at the visit</div>
              </div>
              {patient ? (
                <button className="btn accent" type="submit" disabled={busy}>{busy ? 'Booking…' : `Book visit · ${inr(visitFee + suppliesTotal)}`}</button>
              ) : (
                <Link className="btn" href="/login?next=/nursing">Log in to book</Link>
              )}
            </div>
          </div>
        </form>
      )}

      {patient && myVisits.length > 0 && (
        <>
          <div className="section-title">My visits</div>
          <div className="grid cards">
            {myVisits.map((b) => (
              <div key={b._id} className="card">
                <div className="row"><b style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconTile icon={serviceIcon(b.serviceType)} size={32} /> {b.serviceType.replace(/_/g, ' ').toLowerCase()}</b><span className="pill">{b.status}</span></div>
                <div className="muted">{String(b.scheduledDate).slice(0, 10)} · {b.scheduledTime}</div>
                {b.supplies?.status === 'ORDERED' && <div className="muted">Supplies ordered · {inr(b.supplies.amount || 0)}</div>}
                {b.status === 'REQUESTED' && b.dispatch?.status === 'NO_STAFF' && (
                  <div className="row" style={{ justifyContent: 'flex-start', gap: 12 }}>
                    <span className="muted" style={{ color: 'var(--night)' }}>No professional was free.</span>
                    <button className="linkbtn" onClick={() => reschedule(b._id)}>Pick another time</button>
                  </div>
                )}
                {b.status === 'CANCELLED' && (b.cancellation?.cancellationFee || 0) > 0 && (
                  <div className="muted">Cancellation fee {inr(b.cancellation?.cancellationFee || 0)}, added to your next booking</div>
                )}
                {!['COMPLETED', 'CANCELLED'].includes(b.status) && (
                  <button className="linkbtn" style={{ paddingLeft: 0 }} onClick={() => cancel(b._id)}>Cancel visit</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
