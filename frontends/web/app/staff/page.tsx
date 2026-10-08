'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, IndianRupee, MapPin, Navigation, Phone, ShieldAlert, Star, Store, UserRound, Wallet } from 'lucide-react';
import ProposalDialog from '../_components/care/ProposalDialog';
import type { CareBooking, StaffDashboard, VisitOffer } from '@medrush/shared';
import { api } from '@/lib/api';
import UpdatesFeed from '../_components/UpdatesFeed';
import { Modal, alertDialog, confirmDialog, promptDialog } from '../_components/Dialog';

/**
 * Website version of the Partner app's staff screen (nurse / physio): go online,
 * ring and show nearby visit offers, accept / decline, run each visit
 * (on the way → start with the patient's code → complete with notes and cash),
 * share live location on the way, SOS, earnings. Browsers can't run in the
 * background like the app, so the tab must stay open while online.
 */

type Store = { name?: string; address?: { line1?: string } };
type Visit = Omit<CareBooking, 'supplies'> & {
  patient?: { name?: string; phone?: string };
  supplies?: Omit<NonNullable<CareBooking['supplies']>, 'pharmacyVendor'> & { pharmacyVendor?: Store | string };
};

const DEMO_POINT = { lat: 26.9110, lng: 75.8010 }; // Jaipur demo area (staging)
const NEXT: Record<string, { step: 'confirm' | 'en-route' | 'start' | 'complete'; label: string } | undefined> = {
  ASSIGNED: { step: 'confirm', label: 'Accept visit' },
  CONFIRMED: { step: 'en-route', label: 'I’m on my way' },
  EN_ROUTE: { step: 'start', label: 'Start visit' },
  IN_PROGRESS: { step: 'complete', label: 'Complete visit' }
};
const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
const nice = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Where am I? Browser location, or the Jaipur demo area when unavailable. */
function locate(): Promise<{ lat: number; lng: number; demo: boolean }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) { resolve({ ...DEMO_POINT, demo: true }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, demo: false }),
      () => resolve({ ...DEMO_POINT, demo: true }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

/** A phone-style ring made with Web Audio (no audio file); needs one user click first. */
function useRinger() {
  const ctxRef = useRef<AudioContext | null>(null);
  const timer = useRef<number | null>(null);
  const unlock = () => {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor) ctxRef.current = new Ctor();
    }
    ctxRef.current?.resume().catch(() => undefined);
  };
  const burst = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    [0, 0.45].forEach((offset) => {
      [440, 480].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.38);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.4);
      });
    });
  };
  const start = () => {
    if (timer.current) return;
    burst();
    timer.current = window.setInterval(burst, 2000);
  };
  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };
  return { unlock, start, stop };
}

export default function StaffDashboardPage() {
  const [dash, setDash] = useState<StaffDashboard | null>(null);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [offer, setOffer] = useState<VisitOffer | null>(null);
  const [online, setOnline] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState<Visit | null>(null);
  const [proposing, setProposing] = useState<string | null>(null);
  const ringer = useRinger();
  const offerId = useRef<string | null>(null);

  const load = useCallback(() => {
    api.getStaffDashboard().then((r) => { setDash(r.dashboard); setOnline(r.dashboard.availability.online); }).catch((e) => setError(e.status === 401 || e.status === 403 ? 'auth' : e.message));
    api.getMyAssignedVisits().then((r) => setVisits((r.data || []) as Visit[])).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  // While online: heartbeat with location every 60 s, check for offers every 5 s.
  useEffect(() => {
    if (!online) { ringer.stop(); return undefined; }
    let alive = true;
    const beat = async () => {
      const at = await locate();
      if (!alive) return;
      setDemo(at.demo);
      api.setStaffAvailability(true, { lat: at.lat, lng: at.lng }).catch(() => undefined);
    };
    const poll = () => api.getMyOffer().then((r) => {
      if (!alive) return;
      const next = r.offer;
      if (next && next.bookingId !== offerId.current) {
        ringer.start();
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification('New visit request', { body: `${nice(next.serviceType)} · earn ${inr(next.earnings)}` });
        }
      }
      if (!next) ringer.stop();
      offerId.current = next ? next.bookingId : null;
      setOffer(next);
    }).catch(() => undefined);
    beat();
    poll();
    const hb = window.setInterval(beat, 60000);
    const pl = window.setInterval(poll, 5000);
    return () => { alive = false; window.clearInterval(hb); window.clearInterval(pl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // On the way: share live location with the patient every 15 s.
  useEffect(() => {
    const live = (visits || []).filter((v) => v.status === 'EN_ROUTE');
    if (!live.length) return undefined;
    const share = async () => {
      const at = await locate();
      live.forEach((v) => api.shareVisitLocation(v._id, at.lat, at.lng).catch(() => undefined));
    };
    share();
    const t = window.setInterval(share, 15000);
    return () => window.clearInterval(t);
  }, [visits]);

  async function toggleOnline() {
    ringer.unlock(); // browsers only play sound after a click
    setBusy(true);
    setError(null);
    try {
      if (online) {
        await api.setStaffAvailability(false);
        setOnline(false);
        setOffer(null);
      } else {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => undefined);
        const at = await locate();
        setDemo(at.demo);
        await api.setStaffAvailability(true, { lat: at.lat, lng: at.lng });
        setOnline(true);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your status');
    } finally {
      setBusy(false);
    }
  }

  async function respond(accept: boolean) {
    if (!offer) return;
    ringer.stop();
    try {
      if (accept) await api.acceptOffer(offer.bookingId); else await api.declineOffer(offer.bookingId);
      setOffer(null);
      offerId.current = null;
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not respond');
    }
  }

  async function step(v: Visit) {
    const next = NEXT[v.status];
    if (!next) return;
    if (next.step === 'complete') { setCompleting(v); return; }
    let body: { visitCode?: string } | undefined;
    if (next.step === 'start') {
      const code = await promptDialog({
        title: 'Start the visit',
        message: 'Ask the patient for the 4-digit visit code in their Nabz app.',
        label: 'Visit code',
        placeholder: '4 digits…',
        inputMode: 'numeric',
        maxLength: 4,
        pattern: /^\d{4}$/,
        patternHint: 'The visit code is 4 digits.',
        confirmLabel: 'Start visit'
      });
      if (!code) return;
      body = { visitCode: code };
    }
    try {
      await api.updateVisitStep(v._id, next.step, body);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the visit');
    }
  }

  async function sos(v: Visit) {
    if (!(await confirmDialog({ title: 'Alert the Nabz safety team?', message: 'We share your live location with the team. For a medical emergency also call 108; for police call 112.', confirmLabel: 'Send SOS', danger: true }))) return;
    const at = await locate();
    try {
      const r = await api.raiseSos(v._id, { lat: at.lat, lng: at.lng });
      await alertDialog({ title: 'Nabz safety team alerted', message: `Ambulance ${r.emergencyNumbers.ambulance || '108'} · Police ${r.emergencyNumbers.police || '112'}.` });
    } catch {
      await alertDialog({ title: 'Could not reach Nabz', message: 'Call 112 now for emergencies.' });
    }
  }

  if (error === 'auth') {
    return <div className="notice" style={{ marginTop: 20 }}>Please <Link href="/staff/login" className="link">sign in as medical staff</Link>.</div>;
  }

  const verified = dash?.profile.verified;
  const canGoOnline = !!verified && verified.id && verified.police && verified.council;
  const active = (visits || []).filter((v) => !['COMPLETED', 'CANCELLED'].includes(v.status));
  const past = (visits || []).filter((v) => ['COMPLETED', 'CANCELLED'].includes(v.status)).slice(0, 6);

  return (
    <>
      <section className="hero staff-hero">
        <div className="staff-head">
          <div>
            <span className="eyebrow">Medical staff</span>
            <h1 style={{ fontSize: 34, margin: '6px 0 4px' }}>Hi, {(dash?.name || '').split(' ')[0] || 'there'}</h1>
            <p style={{ margin: 0 }}>
              <Star size={14} aria-hidden="true" /> {dash?.rating ? `${dash.rating.toFixed(1)} · ${dash.totalReviews} reviews` : 'New · no reviews yet'}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link href="/partner/shop" className="btn light"><Store size={16} aria-hidden="true" /> My Shop</Link>
            <Link href="/partner/account" className="btn light" aria-label="My account"><UserRound size={16} aria-hidden="true" /> My account</Link>
          </div>
        </div>

        <div className={`online-card ${online ? 'on' : ''}`}>
          <div>
            <b>{online ? 'You’re online' : 'You’re offline'}</b>
            <div className="muted-on">{online ? 'Keep this tab open to get visit requests nearby.' : 'Go online to get visit requests near you.'}</div>
            {online && demo && <div className="muted-on">Location unavailable: using the Jaipur demo area.</div>}
          </div>
          <button className="btn light" onClick={toggleOnline} disabled={busy || (!online && !canGoOnline)} aria-pressed={online}>
            {busy ? '…' : online ? 'Go offline' : 'Go online'}
          </button>
        </div>
        {dash && !canGoOnline && (
          <div className="notice" style={{ marginTop: 12 }}>
            You can go online once your ID, police check and council registration are verified.{' '}
            <Link href="/partner/verification" className="link">Add your documents</Link>
          </div>
        )}
      </section>

      {error && <div className="notice bad" style={{ marginTop: 14 }} role="alert">{error}</div>}

      {offer && <OfferCard offer={offer} onAccept={() => respond(true)} onDecline={() => respond(false)} />}

      {dash && (
        <div className="stat-grid">
          <Stat icon={IndianRupee} label={`Today · ${dash.today.visits} visits`} value={inr(dash.today.earnings)} />
          <Stat icon={Wallet} label={`This week · ${dash.week.visits} visits`} value={inr(dash.week.earnings)} />
          <Stat icon={Wallet} label="Next weekly payout" value={inr(dash.pendingPayout)} />
          <Stat icon={Navigation} label="Upcoming visits" value={String(dash.upcomingVisits)} />
        </div>
      )}

      <UpdatesFeed audience="partner" title="Updates from Nabz" />

      <h2 className="section-title">Your visits</h2>
      {visits === null && <div className="stack" aria-busy="true" aria-label="Loading visits">{[0, 1].map((i) => <div key={i} className="card skeleton-card" />)}</div>}
      {visits?.length === 0 && <p className="muted">No visits yet. Go online to receive requests.</p>}
      <div className="grid cards">
        {active.map((v) => <VisitCard key={v._id} v={v} onStep={() => step(v)} onSos={() => sos(v)} onPropose={() => setProposing(v._id)} />)}
      </div>
      {past.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Recent</h3>
          <div className="grid cards">{past.map((v) => <VisitCard key={v._id} v={v} onPropose={v.status === 'COMPLETED' ? () => setProposing(v._id) : undefined} />)}</div>
        </>
      )}

      {proposing && <ProposalDialog bookingId={proposing} onClose={() => setProposing(null)} />}
      {completing && <CompleteDialog visit={completing} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); load(); }} />}
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="card stat">
      <Icon size={16} aria-hidden="true" />
      <b className="stat-value">{value}</b>
      <span className="muted">{label}</span>
    </div>
  );
}

function OfferCard({ offer, onAccept, onDecline }: { offer: VisitOffer; onAccept: () => void; onDecline: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(t);
  }, [offer.expiresAt]);
  return (
    <section className="offer-card" aria-live="assertive">
      <div className="row"><span className="offer-kicker">New request · {offer.when}</span><b>{left}s</b></div>
      <div className="offer-earn">{inr(offer.earnings)}</div>
      <div><b>{nice(offer.serviceType)}</b>{offer.patientFirstName ? ` · for ${offer.patientFirstName}` : ''}</div>
      <div className="muted-on"><MapPin size={14} aria-hidden="true" /> {offer.distanceKm !== null ? `${offer.distanceKm} km · ` : ''}{offer.area}</div>
      {offer.supplies && <div className="muted-on">Pick up at {offer.supplies.store || 'partner pharmacy'}: {offer.supplies.items.join(', ')}</div>}
      <div className="offer-actions">
        <button className="btn offer-decline" onClick={onDecline}>Decline</button>
        <button className="btn offer-accept" onClick={onAccept}>Accept · {inr(offer.earnings)}</button>
      </div>
    </section>
  );
}

function VisitCard({ v, onStep, onSos, onPropose }: { v: Visit; onStep?: () => void; onSos?: () => void; onPropose?: () => void }) {
  const store = v.supplies && typeof v.supplies.pharmacyVendor === 'object' ? v.supplies.pharmacyVendor : null;
  const next = NEXT[v.status];
  return (
    <div className="card stack">
      <div className="row"><b>{nice(v.serviceType)}</b><span className="pill violet">{v.status.replace(/_/g, ' ')}</span></div>
      <div className="muted">{v.dispatch?.mode === 'ASAP' ? 'Now' : `${String(v.scheduledDate).slice(0, 10)} · ${v.scheduledTime}`}{v.series ? ` · session ${v.series.index} of ${v.series.total}` : ''}</div>
      <div className="muted"><MapPin size={13} aria-hidden="true" /> {v.serviceLocation?.address?.street}, {v.serviceLocation?.address?.pincode}</div>
      {v.patientDetails?.name && <div className="muted">For {v.patientDetails.name}{v.patientDetails.age ? `, ${v.patientDetails.age}` : ''}</div>}
      {v.serviceLocation?.contactPhone && (
        <a className="link" href={`tel:${v.serviceLocation.contactPhone}`}><Phone size={13} aria-hidden="true" /> Call {v.serviceLocation.contactPerson || 'contact at the address'}</a>
      )}
      {v.supplies?.status === 'ORDERED' && (
        <div className="notice good">
          Pick up from <b>{store?.name || 'partner pharmacy'}</b>{store?.address?.line1 ? `, ${store.address.line1}` : ''}
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {v.supplies.items.filter((i) => i.source === 'STAFF_BRINGS').map((i) => <li key={i.key}>{i.quantity} × {i.name}</li>)}
          </ul>
          <div className="muted">Collect {inr(v.supplies.amount || 0)} from the patient for supplies.</div>
        </div>
      )}
      {(onStep || onSos || onPropose) && (
        <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {onPropose && ['IN_PROGRESS', 'COMPLETED'].includes(v.status) && (
            <button className="btn secondary" onClick={onPropose}><ClipboardList size={16} aria-hidden="true" /> Suggest Plan</button>
          )}
          {next && onStep && <button className="btn" onClick={onStep}>{next.label}</button>}
          {onSos && ['CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'].includes(v.status) && (
            <button className="btn secondary" onClick={onSos} aria-label="SOS: alert the Nabz safety team"><ShieldAlert size={16} aria-hidden="true" /> SOS</button>
          )}
        </div>
      )}
    </div>
  );
}

function CompleteDialog({ visit, onClose, onDone }: { visit: Visit; onClose: () => void; onDone: () => void }) {
  const supplies = visit.supplies?.status === 'ORDERED' ? visit.supplies.amount || 0 : 0;
  const due = visit.payment?.status === 'PAID' ? null : Math.round(((visit.pricing?.payableAmount || 0) + supplies) * 100) / 100;
  const [notes, setNotes] = useState('');
  const [cash, setCash] = useState(due !== null ? String(due) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(cash);
    if (due !== null && (!cash.trim() || !Number.isFinite(amount) || amount < 0)) { setError('Enter the cash you collected.'); return; }
    if (due !== null && amount + 1 < due && !(await confirmDialog({ title: 'Less cash than due', message: `The customer owes ${inr(due)}. You entered ${inr(amount)}. The difference is recorded as unpaid.`, confirmLabel: 'Submit anyway' }))) return;
    setBusy(true);
    try {
      await api.updateVisitStep(visit._id, 'complete', { ...(notes.trim() ? { observations: notes.trim() } : {}), ...(due !== null ? { cashCollected: amount } : {}) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the visit');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="complete-title" as="form" onSubmit={submit}>
        <h2 id="complete-title" style={{ marginTop: 0 }}>Complete visit</h2>
        <label htmlFor="notes">Visit notes for the patient (optional)</label>
        <textarea id="notes" name="observations" autoComplete="off" className="input" rows={4} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done, observations…" />
        {due !== null ? (
          <>
            <label htmlFor="cash">Cash collected (due {inr(due)})</label>
            <input id="cash" name="cashCollected" autoComplete="off" className="input" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ''))} />
          </>
        ) : <p className="muted">Paid online. Nothing to collect.</p>}
        {error && <div className="notice bad" role="alert">{error}</div>}
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Mark completed'}</button>
        </div>
    </Modal>
  );
}
