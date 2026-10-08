'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, Building2, Clock, Home, Languages, MapPin, Minus, Plus, ShieldCheck, Star, Tag, Lock } from 'lucide-react';
import type { CareMode, CareQuote, PlanPaymentMode, RateCardLine, ShopPage, SlotDay, PlanProposalView } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { KINDS, addDays, fmtDay, fmtTime, hoursLabel, inr, problem, todayIst, useVisitPlace, weekdayOf, WEEKDAY_LETTERS, WEEKDAY_NAMES } from '@/lib/care';
import CareArt from '../../../_components/care/CareArt';
import PlacePicker from '../../../_components/care/PlacePicker';

const MAX_SESSIONS = 30;

export default function ShopPageRoute() {
  return <Suspense fallback={<div className="mk-skel" style={{ minHeight: 320 }} />}><Shop /></Suspense>;
}

function Shop() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { patient } = useAuth();
  const { place, setPlace, useMyLocation, locating } = useVisitPlace(patient?.savedAddresses);

  const [shop, setShop] = useState<ShopPage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [item, setItem] = useState<RateCardLine | null>(null);
  const [mode, setMode] = useState<CareMode>((search.get('mode') as CareMode) || 'HOME');
  const [sessions, setSessions] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('');
  const [time, setTime] = useState('');
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [forWhom, setForWhom] = useState<'me' | 'other'>('me');
  const [pd, setPd] = useState({ name: '', age: '', gender: '', relation: '' });
  const [payment, setPayment] = useState<PlanPaymentMode>('PER_SESSION');
  const [proposal, setProposal] = useState<PlanProposalView | null>(null);
  const [quote, setQuote] = useState<CareQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [booking, setBooking] = useState(false);
  const [notice, setNotice] = useState('');
  const bookingRef = useRef<HTMLDivElement>(null);

  // Load the shop (with the travel fee to the chosen address).
  useEffect(() => {
    api.marketStore(id, place.coords || undefined).then((r) => {
      setShop(r.store);
      setItem((cur) => cur || r.store.rateCard.find((l) => l.service._id === search.get('service')) || null);
    }).catch((e) => setLoadError(problem(e).message));
  }, [id, place.coords, search]);

  // A plan the professional suggested after a visit.
  useEffect(() => {
    const pid = search.get('proposal');
    if (!pid || !patient || !shop) return;
    api.myProposals().then((r) => {
      const p = r.proposals.find((x) => x._id === pid);
      if (!p) return;
      setProposal(p);
      const line = shop.rateCard.find((l) => l.service._id === p.service);
      if (line) setItem(line);
      setMode(p.mode);
      setSessions(p.sessions);
    }).catch(() => undefined);
  }, [search, patient, shop]);

  const homeOk = Boolean(item?.home.enabled && shop?.home.enabled);
  const clinicOk = Boolean(item?.clinic.enabled && shop?.clinic.enabled);
  useEffect(() => {
    if (!item) return;
    if (mode === 'HOME' && !homeOk && clinicOk) setMode('CLINIC');
    if (mode === 'CLINIC' && !clinicOk && homeOk) setMode('HOME');
  }, [item, mode, homeOk, clinicOk]);

  // Free times for the next two weeks.
  useEffect(() => {
    if (!item) return;
    setDays(null);
    api.marketSlots(id, { serviceId: item.service._id, mode, days: 14 })
      .then((r) => {
        setDays(r.days);
        const first = r.days.find((d) => d.times.length);
        setStartDate((cur) => (cur && r.days.some((d) => d.date === cur && d.times.length) ? cur : first?.date || ''));
      })
      .catch(() => setDays([]));
  }, [id, item, mode]);

  useEffect(() => {
    if (!startDate) return;
    setWeekdays((cur) => (cur.length ? cur : [weekdayOf(startDate)]));
  }, [startDate]);
  const timesForDay = days?.find((d) => d.date === startDate)?.times || [];
  useEffect(() => { if (time && !timesForDay.includes(time)) setTime(''); }, [timesForDay, time]);

  const price = item ? (mode === 'HOME' ? item.home.price : item.clinic.price) : undefined;
  const discountFor = (n: number) => (item?.sessionDiscounts || []).reduce((b, t) => (n >= t.minSessions && t.percent > b ? t.percent : b), 0);
  const prepaidPercent = discountFor(sessions);
  const needsAddress = mode === 'HOME';
  const ready = Boolean(patient && item && startDate && time && (!needsAddress || place.coords) && (forWhom === 'me' || pd.name.trim().length > 1));

  // Live bill: re-quote when anything changes (prices always come from the server).
  useEffect(() => {
    if (!ready || !item) { setQuote(null); return; }
    const t = setTimeout(() => {
      setQuoting(true);
      setQuoteError('');
      api.careQuote({
        storeId: id,
        serviceId: item.service._id,
        mode,
        sessions,
        paymentMode: payment,
        schedule: { startDate, time, weekdays: sessions > 1 ? weekdays : undefined },
        ...(needsAddress ? (place.addressId ? { addressId: place.addressId } : { address: place.address || { street: place.label, coordinates: place.coords! } }) : {}),
        ...(forWhom === 'other' ? { patientDetails: { name: pd.name.trim(), age: pd.age ? Number(pd.age) : undefined, gender: (pd.gender || undefined) as 'Male' | undefined, relation: pd.relation || undefined } } : {}),
        ...(proposal ? { proposalId: proposal._id } : {})
      }).then((r) => setQuote(r.quote))
        .catch((e) => { setQuote(null); setQuoteError(problem(e).message); })
        .finally(() => setQuoting(false));
    }, 350);
    return () => clearTimeout(t);
  }, [ready, id, item, mode, sessions, payment, startDate, time, weekdays, needsAddress, place, forWhom, pd, proposal]);

  const book = async () => {
    if (!quote) return;
    setBooking(true);
    setNotice('');
    try {
      const r = await api.bookCarePlan(quote._id);
      router.push(`/care/plans/${r.plan._id}?new=1`);
    } catch (e) {
      const p = problem(e);
      if (p.code === 'PRICE_CHANGED' && p.details?.quote) { setQuote(p.details.quote); setNotice(p.message); }
      else if (p.code === 'SLOT_TAKEN') { setNotice(p.message); setTime(''); setDays(null); api.marketSlots(id, { serviceId: item!.service._id, mode, days: 14 }).then((r) => setDays(r.days)).catch(() => setDays([])); }
      else setNotice(p.message);
    } finally {
      setBooking(false);
    }
  };

  if (loadError) return <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>{loadError}</strong><Link className="mk-btn ghost" href="/care">Back to Care</Link></div>;
  if (!shop) return <div className="mk-grid" style={{ marginTop: 10 }}><div className="mk-skel" style={{ minHeight: 220 }} /><div className="mk-skel" style={{ minHeight: 220 }} /></div>;
  const meta = KINDS[shop.kind === 'LAB' ? 'LAB' : shop.kind];
  const toggleDay = (d: number) => setWeekdays((cur) => (cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d].sort()));

  return (
    <div>
      <section className="mk-hero" aria-labelledby="shop-name">
        <div className="in" style={{ gridTemplateColumns: '1.3fr .7fr' }}>
          <div>
            <div className="mk-badges" style={{ marginBottom: 12 }}>
              {shop.registered && <span className="mk-badge green"><BadgeCheck size={13} aria-hidden="true" /> Verified</span>}
              {shop.accredited && <span className="mk-badge green"><ShieldCheck size={13} aria-hidden="true" /> NABL</span>}
              {shop.isPaused && <span className="mk-badge red">Not taking bookings today</span>}
            </div>
            <h1 id="shop-name">{shop.name}</h1>
            <p>{shop.bio || meta.pitch}</p>
            <div className="mk-badges">
              {shop.rating.count > 0 && <span className="mk-badge" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}><Star size={13} fill="#ffc94d" color="#ffc94d" aria-hidden="true" /> {shop.rating.avg.toFixed(1)} ({shop.rating.count} reviews)</span>}
              {shop.experienceYears ? <span className="mk-badge" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}>{shop.experienceYears} years</span> : null}
              {shop.languages.length > 0 && <span className="mk-badge" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}><Languages size={13} aria-hidden="true" /> {shop.languages.join(', ')}</span>}
            </div>
          </div>
          <div className="art" style={{ maxWidth: 220 }}><CareArt kind={meta.art} /></div>
        </div>
      </section>

      <div className="mk-book">
        <div style={{ display: 'grid', gap: 16 }}>
          {proposal && <p className="mk-note green">Suggested by {shop.name}: {proposal.sessions} × {proposal.serviceName}{proposal.note ? `. “${proposal.note}”` : ''}</p>}

          <section className="mk-card" aria-labelledby="menu-title">
            <h2 id="menu-title" className="mk-title" style={{ fontSize: 20, marginBottom: 12 }}>Services and prices</h2>
            {shop.rateCard.length === 0 && <p className="mk-meta">No services listed yet.</p>}
            <div className="mk-list" role="radiogroup" aria-label="Service">
              {shop.rateCard.map((line) => {
                const on = item?._id === line._id;
                return (
                  <button
                    key={line._id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={Boolean(proposal) && !on}
                    onClick={() => { setItem(line); setQuote(null); bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="mk-card"
                    style={{ textAlign: 'left', cursor: 'pointer', borderColor: on ? 'var(--night)' : undefined, boxShadow: on ? '0 0 0 2px var(--night)' : undefined, padding: 14 }}
                  >
                    <div className="mk-row">
                      <div className="grow">
                        <p className="mk-title" style={{ fontSize: 16 }}>{line.service.displayName}</p>
                        <p className="mk-meta" style={{ margin: '3px 0 0' }}><Clock size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> {hoursLabel(line.durationMinutes)}{line.sessionDiscounts.length ? ` · up to ${Math.max(...line.sessionDiscounts.map((d) => d.percent))}% off on plans` : ''}</p>
                        {line.offer && <span className="mk-badge red" style={{ marginTop: 6 }}><Tag size={12} aria-hidden="true" /> {line.offer.label}</span>}
                      </div>
                      <div style={{ textAlign: 'right', display: 'grid', gap: 2 }}>
                        {line.clinic.enabled && <span className="mk-price" style={{ fontSize: 17 }}>{inr(line.clinic.price)} <small>clinic</small></span>}
                        {line.home.enabled && <span className="mk-price" style={{ fontSize: 17 }}>{inr(line.home.price)} <small>home</small></span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {item && (
            <section ref={bookingRef} className="mk-card" aria-labelledby="book-title" style={{ display: 'grid', gap: 18, scrollMarginTop: 90 }}>
              <h2 id="book-title" className="mk-title" style={{ fontSize: 20 }}>Book {item.service.displayName}</h2>

              {homeOk && clinicOk && (
                <div className="mk-field">
                  <span className="mk-label">Where</span>
                  <div className="mk-seg" role="group" aria-label="Where">
                    <button type="button" aria-pressed={mode === 'HOME'} disabled={Boolean(proposal)} onClick={() => setMode('HOME')}><Home size={14} aria-hidden="true" /> At Home</button>
                    <button type="button" aria-pressed={mode === 'CLINIC'} disabled={Boolean(proposal)} onClick={() => setMode('CLINIC')}><Building2 size={14} aria-hidden="true" /> At Clinic</button>
                  </div>
                </div>
              )}
              {mode === 'CLINIC' && shop.clinic.address && <p className="mk-meta" style={{ margin: 0 }}><MapPin size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {[shop.clinic.address.line1, shop.clinic.address.city].filter(Boolean).join(', ')}{Number.isFinite(shop.distanceKm) ? ` · ${shop.distanceKm} km away` : ''}</p>}
              {mode === 'HOME' && (
                <PlacePicker saved={patient?.savedAddresses || []} place={place} onChange={setPlace} onLocate={useMyLocation} locating={locating} signedIn={Boolean(patient)} />
              )}
              {mode === 'HOME' && place.coords && shop.homeCovered === false && <p className="mk-note">This address is outside {shop.name}’s home-visit area ({shop.home.radiusKm} km). {clinicOk ? 'Choose a clinic visit or ' : 'Choose '}another provider.</p>}

              <div className="mk-field">
                <span className="mk-label">Who is it for?</span>
                <div className="mk-seg" role="group" aria-label="Who is it for">
                  <button type="button" aria-pressed={forWhom === 'me'} onClick={() => setForWhom('me')}>Me</button>
                  <button type="button" aria-pressed={forWhom === 'other'} onClick={() => setForWhom('other')}>Someone Else</button>
                </div>
                {forWhom === 'other' && (
                  <div className="mk-split" style={{ marginTop: 6 }}>
                    <div className="mk-field"><label htmlFor="pd-name">Their name</label><input id="pd-name" name="patientName" className="mk-input" autoComplete="off" value={pd.name} onChange={(e) => setPd({ ...pd, name: e.target.value })} placeholder="e.g. Kamla Devi…" /></div>
                    <div className="mk-field"><label htmlFor="pd-rel">Relation</label><input id="pd-rel" name="relation" className="mk-input" autoComplete="off" value={pd.relation} onChange={(e) => setPd({ ...pd, relation: e.target.value })} placeholder="Mother, father…" /></div>
                    <div className="mk-field"><label htmlFor="pd-age">Age</label><input id="pd-age" name="age" className="mk-input" inputMode="numeric" autoComplete="off" value={pd.age} onChange={(e) => setPd({ ...pd, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></div>
                    <div className="mk-field"><label htmlFor="pd-gender">Gender</label>
                      <select id="pd-gender" name="gender" className="mk-select" value={pd.gender} onChange={(e) => setPd({ ...pd, gender: e.target.value })}>
                        <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="mk-field">
                <span className="mk-label" id="sessions-label">How many {meta.unit}s?</span>
                <div className="mk-row" style={{ flexWrap: 'wrap' }}>
                  <div className="mk-stepper" role="group" aria-labelledby="sessions-label">
                    <button type="button" aria-label="Fewer" disabled={Boolean(proposal) || sessions <= 1} onClick={() => setSessions((n) => Math.max(1, n - 1))}><Minus size={16} aria-hidden="true" /></button>
                    <output aria-live="polite">{sessions}</output>
                    <button type="button" aria-label="More" disabled={Boolean(proposal) || sessions >= MAX_SESSIONS} onClick={() => setSessions((n) => Math.min(MAX_SESSIONS, n + 1))}><Plus size={16} aria-hidden="true" /></button>
                  </div>
                  {!proposal && <div className="mk-chips" style={{ padding: 0 }}>{[1, 5, 10, 15].map((n) => <button key={n} type="button" className="mk-chip" aria-pressed={sessions === n} onClick={() => setSessions(n)}>{n}</button>)}</div>}
                </div>
                {item.sessionDiscounts.length > 0 && <p className="mk-help">{item.sessionDiscounts.map((d) => `${d.percent}% off from ${d.minSessions}`).join(', ')} when you pay upfront.</p>}
              </div>

              {sessions > 1 && (
                <div className="mk-field">
                  <span className="mk-label">Which days?</span>
                  <div className="mk-days" role="group" aria-label="Days of the week">
                    {WEEKDAY_LETTERS.map((l, d) => <button key={d} type="button" className="mk-day" aria-pressed={weekdays.includes(d)} aria-label={WEEKDAY_NAMES[d]} onClick={() => toggleDay(d)}>{l}</button>)}
                  </div>
                  <div className="mk-chips" style={{ padding: 0 }}>
                    <button type="button" className="mk-chip" onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}>Every Day</button>
                    <button type="button" className="mk-chip" onClick={() => setWeekdays([1, 2, 3, 4, 5])}>Weekdays</button>
                    <button type="button" className="mk-chip" onClick={() => setWeekdays([1, 3, 5])}>Mon, Wed, Fri</button>
                  </div>
                </div>
              )}

              <div className="mk-field">
                <span className="mk-label">{sessions > 1 ? 'Start date and time' : 'Date and time'}</span>
                {!days && <div className="mk-skel" style={{ minHeight: 70 }} />}
                {days && days.every((d) => !d.times.length) && <p className="mk-note neutral">No free times in the next two weeks. Try {mode === 'HOME' && clinicOk ? 'a clinic visit or ' : ''}another provider.</p>}
                {days && days.some((d) => d.times.length) && (
                  <>
                    <div className="mk-dates" role="group" aria-label="Date">
                      {days.map((d) => (
                        <button key={d.date} type="button" className="mk-date" aria-pressed={startDate === d.date} disabled={!d.times.length} onClick={() => setStartDate(d.date)} style={{ opacity: d.times.length ? 1 : 0.45 }}>
                          {fmtDay(d.date).split(' ')[0]}<b>{d.date.slice(8)}</b>{d.times.length ? `${d.times.length} free` : 'Full'}
                        </button>
                      ))}
                    </div>
                    <div className="mk-slots" role="group" aria-label="Time">
                      {timesForDay.map((t) => <button key={t} type="button" className="mk-slot" aria-pressed={time === t} onClick={() => setTime(t)}>{fmtTime(t)}</button>)}
                    </div>
                  </>
                )}
              </div>

              {sessions > 1 && (
                <div className="mk-field">
                  <span className="mk-label">Payment</span>
                  <div className="mk-split">
                    <button type="button" className="mk-card" aria-pressed={payment === 'PER_SESSION'} onClick={() => setPayment('PER_SESSION')} style={{ textAlign: 'left', cursor: 'pointer', boxShadow: payment === 'PER_SESSION' ? '0 0 0 2px var(--night)' : undefined }}>
                      <strong>Pay after each {meta.unit}</strong><p className="mk-meta" style={{ margin: '4px 0 0' }}>Cash or UPI to the professional</p>
                    </button>
                    <button type="button" className="mk-card" aria-pressed={payment === 'PREPAID'} onClick={() => setPayment('PREPAID')} style={{ textAlign: 'left', cursor: 'pointer', boxShadow: payment === 'PREPAID' ? '0 0 0 2px var(--night)' : undefined }}>
                      <strong>Pay upfront{prepaidPercent ? `, save ${prepaidPercent}%` : ''}</strong><p className="mk-meta" style={{ margin: '4px 0 0' }}>Unused {meta.unit}s are refunded</p>
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="mk-sticky" aria-label="Your bill">
          <div className="mk-card" style={{ display: 'grid', gap: 12 }}>
            <p className="mk-title" style={{ fontSize: 18 }}>Your bill</p>
            {!item && <p className="mk-meta" style={{ margin: 0 }}>Choose a service to see the price.</p>}
            {item && !patient && (
              <>
                <p className="mk-meta" style={{ margin: 0 }}>{inr(price)} per {meta.unit}{mode === 'HOME' && shop.travel ? ` + travel ${inr(shop.travel.fee)}` : ''}</p>
                <Link className="mk-btn block" href={`/login?next=${encodeURIComponent(`/care/shop/${id}?service=${item.service._id}&mode=${mode}`)}`}>Sign In to Book</Link>
              </>
            )}
            {item && patient && !quote && !quoting && !quoteError && <p className="mk-meta" style={{ margin: 0 }}>{!time ? 'Pick a date and time.' : needsAddress && !place.coords ? 'Choose the visit address.' : forWhom === 'other' && !pd.name ? 'Add their name.' : 'Working out your bill…'}</p>}
            {quoting && <div className="mk-skel" style={{ minHeight: 140 }} />}
            {quoteError && !quoting && <p className="mk-note" role="alert">{quoteError}</p>}
            {quote && !quoting && (
              <>
                <div className="mk-bill" aria-live="polite">
                  {quote.lines.map((l) => (
                    <div key={l.code + l.label} className={`line ${l.amount < 0 ? 'neg' : ''}`}><span>{l.label}</span><span>{l.amount < 0 ? `− ${inr(-l.amount)}` : inr(l.amount)}</span></div>
                  ))}
                  <div className="line total"><span>Total</span><span>{inr(quote.amounts.total)}</span></div>
                  {quote.paymentMode === 'PER_SESSION' && quote.sessions > 1 && <p className="mk-help" style={{ margin: 0 }}>You pay {inr(quote.amounts.perSessionPayable)} after each {meta.unit}.</p>}
                  {quote.amounts.creditAvailable > 0 && <p className="mk-note green" style={{ margin: 0 }}>{inr(quote.amounts.creditAvailable)} Nabz credit will be used.</p>}
                </div>
                <details>
                  <summary className="mk-meta" style={{ cursor: 'pointer' }}>{quote.schedule.dates.length} date{quote.schedule.dates.length > 1 ? 's' : ''}, {fmtTime(quote.schedule.time)}</summary>
                  <p className="mk-meta" style={{ margin: '6px 0 0' }}>{quote.schedule.dates.map((d) => fmtDay(d)).join(', ')}</p>
                </details>
                {notice && <p className="mk-note" role="alert">{notice}</p>}
                <button type="button" className="mk-btn block" onClick={book} disabled={booking}>
                  {booking ? 'Booking…' : quote.paymentMode === 'PREPAID' ? `Book & Pay ${inr(quote.amounts.total)}` : 'Confirm Booking'}
                </button>
                <p className="mk-help" style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><Lock size={12} aria-hidden="true" /> Price locked until {new Date(quote.expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</p>
              </>
            )}
          </div>
          {shop.home.enabled && <p className="mk-help" style={{ margin: 0 }}>Home visits up to {shop.home.radiusKm} km, travel {inr(shop.home.ratePerKm)}/km (measured by Nabz).</p>}
        </aside>
      </div>
    </div>
  );
}
