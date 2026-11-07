'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, Clock, FlaskConical, Home, Search, ShieldCheck, X, Building2, Droplets } from 'lucide-react';
import type { LabCompareRow, LabQuote, MarketService, SlotDay, CareMode } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDay, fmtTime, inr, problem, useVisitPlace } from '@/lib/care';
import { payForLabOrder } from '@/lib/razorpay';
import CareArt from '../_components/care/CareArt';
import PlacePicker from '../_components/care/PlacePicker';

export default function LabTestsRoute() {
  return <Suspense fallback={<div className="mk-skel" style={{ minHeight: 320 }} />}><LabTests /></Suspense>;
}

function LabTests() {
  const search = useSearchParams();
  const router = useRouter();
  const { patient } = useAuth();
  const { place, setPlace, useMyLocation, locating } = useVisitPlace(patient?.savedAddresses);
  const [tests, setTests] = useState<MarketService[] | null>(null);
  const [q, setQ] = useState('');
  const [basket, setBasket] = useState<string[]>(() => (search.get('test') ? [search.get('test') as string] : []));
  const [mode, setMode] = useState<CareMode>('HOME');
  const [labs, setLabs] = useState<LabCompareRow[] | null>(null);
  const [lab, setLab] = useState<LabCompareRow | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.marketServices('LAB').then((r) => setTests(r.services)).catch((e) => setError(problem(e).message)); }, []);
  useEffect(() => {
    setLab(null);
    if (!basket.length) { setLabs(null); return; }
    setLabs(null);
    api.compareLabs(basket, { mode, lat: place.coords?.lat, lng: place.coords?.lng })
      .then((r) => setLabs(r.labs)).catch((e) => { setError(problem(e).message); setLabs([]); });
  }, [basket, mode, place.coords]);

  const shown = useMemo(() => (tests || []).filter((t) => t.displayName.toLowerCase().includes(q.trim().toLowerCase())), [tests, q]);
  const byId = useMemo(() => new Map((tests || []).map((t) => [t._id, t])), [tests]);
  const toggle = (id: string) => setBasket((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id].slice(0, 30)));
  const fasting = basket.some((id) => (byId.get(id)?.lab?.fastingHours || 0) > 0);

  return (
    <div>
      <section className="mk-hero" aria-labelledby="lab-title">
        <div className="in slim">
          <div>
            <h1 id="lab-title">Lab tests, <b>compared</b></h1>
            <p>Pick your tests, see every lab’s price, report time and collection fee, and book a home collection.</p>
          </div>
          <div className="art"><CareArt kind="lab" /></div>
        </div>
      </section>

      <div className="mk-book">
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="mk-card" aria-labelledby="tests-title">
            <div className="mk-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <h2 id="tests-title" className="mk-title grow" style={{ fontSize: 20 }}>1. Choose tests</h2>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
                <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 14, top: 15, color: 'var(--muted)' }} />
                <input className="mk-input" style={{ paddingLeft: 38 }} type="search" name="testSearch" aria-label="Search tests" placeholder="Search CBC, thyroid, vitamin D…" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            {!tests && !error && <div className="mk-skel" style={{ minHeight: 140 }} />}
            {error && <p className="mk-note" role="alert">{error}</p>}
            <div className="prod-grid">
              {shown.map((t) => {
                const on = basket.includes(t._id);
                return (
                  <button key={t._id} type="button" aria-pressed={on} onClick={() => toggle(t._id)} className={`prod-tile${on ? ' on' : ''}`}>
                    <p className="prod-name">{t.displayName}</p>
                    <span className="prod-meta" style={{ color: 'var(--amber)' }}>
                      {[t.category === 'LAB_PACKAGE' ? 'Package' : '', (t.lab?.fastingHours || 0) > 0 ? `Fasting ${t.lab?.fastingHours} h` : '', t.lab?.homeCollectable === false ? 'Lab visit only' : ''].filter(Boolean).join(' · ')}
                    </span>
                    {t.fromPrice != null && <span className="prod-price"><small>from </small>{inr(t.fromPrice)}</span>}
                    <span className="prod-check" aria-hidden="true">{on ? 'Added' : 'Add'}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {basket.length > 0 && (
            <section className="mk-card" aria-labelledby="labs-title" style={{ display: 'grid', gap: 14 }}>
              <div className="mk-row" style={{ flexWrap: 'wrap' }}>
                <h2 id="labs-title" className="mk-title grow" style={{ fontSize: 20 }}>2. Compare labs</h2>
                <div className="mk-seg" role="group" aria-label="Collection">
                  <button type="button" aria-pressed={mode === 'HOME'} onClick={() => setMode('HOME')}><Home size={14} aria-hidden="true" /> Home Collection</button>
                  <button type="button" aria-pressed={mode === 'CLINIC'} onClick={() => setMode('CLINIC')}><Building2 size={14} aria-hidden="true" /> Visit Lab</button>
                </div>
              </div>
              {mode === 'HOME' && <PlacePicker saved={patient?.savedAddresses || []} place={place} onChange={setPlace} onLocate={useMyLocation} locating={locating} signedIn={Boolean(patient)} />}
              {fasting && <p className="mk-note neutral"><Droplets size={16} aria-hidden="true" /> Some tests need fasting. Collection is offered only in the morning.</p>}
              <div aria-live="polite" className="mk-list">
                {!labs && <div className="mk-skel" />}
                {labs && labs.length === 0 && <p className="mk-note neutral">{mode === 'HOME' && !place.coords ? 'Choose the collection address to see labs that come to you.' : 'No lab offers these tests here yet. Try a lab visit or fewer tests.'}</p>}
                {(labs || []).map((row) => (
                  <article key={row.store._id} className="mk-card" style={{ padding: 14, display: 'grid', gap: 10, boxShadow: lab?.store._id === row.store._id ? '0 0 0 2px var(--night)' : undefined }}>
                    <div className="mk-row">
                      <span className="mk-tile"><FlaskConical size={22} aria-hidden="true" /></span>
                      <div className="grow">
                        <p className="mk-title">{row.store.name}</p>
                        <div className="mk-badges" style={{ marginTop: 4 }}>
                          {row.accredited && <span className="mk-badge green"><ShieldCheck size={12} aria-hidden="true" /> NABL</span>}
                          <span className="mk-badge"><Clock size={12} aria-hidden="true" /> Report in {row.reportHours} h</span>
                          {Number.isFinite(row.distanceKm) && <span className="mk-badge">{row.distanceKm} km</span>}
                          {!row.offersAll && <span className="mk-badge red">{row.tests.length} of {basket.length} tests</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="mk-price">{inr(row.testsSubtotal + (mode === 'HOME' && row.homeCollection ? row.homeCollection.fee : 0))}</span>
                        <p className="mk-meta" style={{ margin: 0 }}>{mode === 'HOME' && row.homeCollection ? (row.homeCollection.waived || row.homeCollection.fee === 0 ? 'Free collection' : `incl. ${inr(row.homeCollection.fee)} collection`) : 'at the lab'}</p>
                      </div>
                    </div>
                    {row.missing.length > 0 && <p className="mk-help" style={{ margin: 0 }}>Not offered here: {row.missing.map((m) => m.name).join(', ')}</p>}
                    <div className="mk-row" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="mk-btn small" disabled={!row.offersAll} onClick={() => setLab(row)}>{row.offersAll ? 'Choose Lab' : 'Remove Missing Tests First'}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {lab && <LabBooking row={lab} serviceIds={basket} mode={mode} place={place} fasting={fasting} signedIn={Boolean(patient)} onBooked={(id) => router.push(`/lab-tests/orders/${id}?new=1`)} />}
        </div>

        <aside className="mk-sticky" aria-label="Your tests">
          <div className="mk-card" style={{ display: 'grid', gap: 10 }}>
            <p className="mk-title">Your tests ({basket.length})</p>
            {basket.length === 0 && <p className="mk-meta" style={{ margin: 0 }}>Tap tests to add them.</p>}
            {basket.map((id) => (
              <div key={id} className="mk-row">
                <span className="grow" style={{ fontSize: 14, fontWeight: 600 }}>{byId.get(id)?.displayName || 'Test'}</span>
                <button type="button" className="mk-icon-btn" style={{ width: 30, height: 30 }} aria-label={`Remove ${byId.get(id)?.displayName || 'test'}`} onClick={() => toggle(id)}><X size={14} aria-hidden="true" /></button>
              </div>
            ))}
            {patient && <Link href="/lab-tests/orders" className="mk-btn soft small">My Lab Bookings</Link>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LabBooking({ row, serviceIds, mode, place, fasting, signedIn, onBooked }: {
  row: LabCompareRow; serviceIds: string[]; mode: CareMode; place: ReturnType<typeof useVisitPlace>['place']; fasting: boolean; signedIn: boolean; onBooked: (id: string) => void;
}) {
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [payment, setPayment] = useState<'PAY_AT_COLLECTION' | 'PREPAID'>('PAY_AT_COLLECTION');
  const [quote, setQuote] = useState<LabQuote | null>(null);
  const [err, setErr] = useState('');
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    setDays(null);
    api.marketSlots(row.store._id, { serviceId: serviceIds[0], mode, days: 10 })
      .then((r) => { setDays(r.days); setDate(r.days.find((d) => d.times.length)?.date || ''); }).catch(() => setDays([]));
  }, [row, serviceIds, mode]);
  const times = (days?.find((d) => d.date === date)?.times || []).filter((t) => !fasting || t <= '10:00');

  const input = () => ({
    storeId: row.store._id, serviceIds, mode, slot: { date, time }, paymentMode: payment,
    ...(mode === 'HOME' ? (place.addressId ? { addressId: place.addressId } : { address: place.address || (place.coords ? { street: place.label, coordinates: place.coords } : undefined) }) : {})
  });
  useEffect(() => {
    if (!signedIn || !date || !time) { setQuote(null); return; }
    setErr('');
    api.labQuote(input()).then((r) => setQuote(r.quote)).catch((e) => { setQuote(null); setErr(problem(e).message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, date, time, payment, mode, place]);

  const book = async () => {
    if (!quote) return;
    setBooking(true);
    setErr('');
    try {
      const r = await api.bookLabOrder({ ...input(), expectedTotal: quote.amounts.total });
      // Online: open the payment right away; if it's closed, the order page offers Pay Now until the hold ends.
      if (r.order.payment.mode === 'PREPAID' && r.order.payment.status === 'PENDING') await payForLabOrder(r.order._id).catch(() => undefined);
      onBooked(r.order._id);
    } catch (e) {
      const p = problem(e);
      if (p.code === 'PRICE_CHANGED' && p.details?.quote) setQuote(p.details.quote);
      setErr(p.message);
    } finally { setBooking(false); }
  };

  return (
    <section className="mk-card" aria-labelledby="slot-title" style={{ display: 'grid', gap: 14 }}>
      <h2 id="slot-title" className="mk-title" style={{ fontSize: 20 }}>3. {mode === 'HOME' ? 'Collection time' : 'Visit time'} at {row.store.name}</h2>
      {!days && <div className="mk-skel" style={{ minHeight: 90 }} />}
      {days && (
        <>
          <div className="mk-dates" role="group" aria-label="Date">
            {days.map((d) => <button key={d.date} type="button" className="mk-date" aria-pressed={date === d.date} disabled={!d.times.length} onClick={() => { setDate(d.date); setTime(''); }} style={{ opacity: d.times.length ? 1 : 0.45 }}>{fmtDay(d.date).split(' ')[0]}<b>{d.date.slice(8)}</b>{d.times.length ? 'Open' : 'Full'}</button>)}
          </div>
          <div className="mk-slots" role="group" aria-label="Time">
            {times.map((t) => <button key={t} type="button" className="mk-slot" aria-pressed={time === t} onClick={() => setTime(t)}>{fmtTime(t)}</button>)}
          </div>
          {date && !times.length && <p className="mk-help">{fasting ? 'No morning times left that day.' : 'No times left that day.'}</p>}
        </>
      )}
      <div className="mk-seg" role="group" aria-label="Payment" style={{ justifySelf: 'start' }}>
        <button type="button" aria-pressed={payment === 'PAY_AT_COLLECTION'} onClick={() => setPayment('PAY_AT_COLLECTION')}>Pay at Collection</button>
        <button type="button" aria-pressed={payment === 'PREPAID'} onClick={() => setPayment('PREPAID')}>Pay Online</button>
      </div>
      {!signedIn && <Link className="mk-btn" href="/login?next=/lab-tests">Sign In to Book</Link>}
      {err && <p className="mk-note" role="alert">{err}</p>}
      {quote && (
        <div className="mk-bill" aria-live="polite">
          {quote.tests.map((t) => <div key={t.service} className="line"><span>{t.name}</span><span>{inr(t.price)}</span></div>)}
          {mode === 'HOME' && <div className={`line ${quote.amounts.collectionWaived ? 'neg' : ''}`}><span>Home collection</span><span>{quote.amounts.collectionWaived ? 'Free' : inr(quote.amounts.collectionFee)}</span></div>}
          {quote.amounts.platformFee > 0 && <div className="line"><span>Nabz fee</span><span>{inr(quote.amounts.platformFee)}</span></div>}
          <div className="line"><span>GST</span><span>{inr(quote.amounts.gst)}</span></div>
          <div className="line total"><span>Total</span><span>{inr(quote.amounts.total)}</span></div>
          {quote.creditAvailable > 0 && <p className="mk-note green" style={{ margin: 0 }}>{inr(Math.min(quote.creditAvailable, quote.amounts.total))} Nabz credit will be used.</p>}
          <p className="mk-help" style={{ margin: 0 }}><BadgeCheck size={12} aria-hidden="true" /> Report in about {quote.reportHours} hours after collection.</p>
          <button type="button" className="mk-btn block" onClick={book} disabled={booking}>{booking ? 'Booking…' : `Book for ${fmtDay(date)}, ${fmtTime(time)}`}</button>
        </div>
      )}
    </section>
  );
}
