'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, CalendarOff, LocateFixed, Megaphone, PauseCircle, PlayCircle, Plus, Save, Store, Tag, Trash2, Users } from 'lucide-react';
import type { MarketService, MyRateCardItem, MyShop, ShopKind, TeamMember, DayHours } from '@medrush/shared';
import { api } from '@/lib/api';
import { KINDS, hoursLabel, inr, problem, todayIst, fmtDay } from '@/lib/care';
import { alertDialog, confirmDialog } from '../../_components/Dialog';
import CareArt from '../../_components/care/CareArt';

const DAYS: DayHours['day'][] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const TABS = [['profile', 'Shop & Hours'], ['menu', 'Rate Card'], ['team', 'Team'], ['leave', 'Leave & Pause'], ['plans', 'Plans']] as const;
type Tab = typeof TABS[number][0];

export default function PartnerShopRoute() {
  return <Suspense fallback={<div className="mk-skel" style={{ minHeight: 320 }} />}><PartnerShop /></Suspense>;
}

function PartnerShop() {
  const search = useSearchParams();
  const router = useRouter();
  const tab = (search.get('tab') as Tab) || 'profile';
  const [kind, setKind] = useState<ShopKind | undefined>((search.get('kind') as ShopKind) || undefined);
  const [kinds, setKinds] = useState<ShopKind[]>([]);
  const [shop, setShop] = useState<MyShop | null>(null);
  const [rateCard, setRateCard] = useState<MyRateCardItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [authError, setAuthError] = useState('');

  const load = useCallback(() => api.myShop(kind).then((r) => {
    setKinds(r.kinds);
    setShop(r.store);
    setRateCard(r.rateCard);
    setLoaded(true);
    if (!kind && r.store) setKind(r.store.kind);
    if (!kind && !r.store && r.kinds[0]) setKind(r.kinds[0]);
  }).catch((e) => { const p = problem(e); setAuthError((e as { status?: number }).status === 401 || (e as { status?: number }).status === 403 ? 'auth' : p.message); setLoaded(true); }), [kind]);
  useEffect(() => { load(); }, [load]);

  const go = (t: Tab) => {
    const next = new URLSearchParams(search.toString());
    next.set('tab', t);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  if (authError === 'auth') return <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>Sign in with your partner account</strong><Link className="mk-btn" href="/staff/login">Partner Sign In</Link></div>;
  if (!loaded) return <div className="mk-skel" style={{ minHeight: 320 }} />;
  const meta = kind ? KINDS[kind] : KINDS.PHYSIO;

  return (
    <div>
      <section className="mk-hero" aria-labelledby="shop-title">
        <div className="in" style={{ gridTemplateColumns: '1.3fr .7fr' }}>
          <div>
            <h1 id="shop-title">{shop ? shop.name : `Open your ${meta.label.toLowerCase()} shop`}</h1>
            <p>{shop ? 'Set your own prices, hours and where you go. Customers compare and book you directly.' : 'Customers near you compare providers and book the one they like. You set the prices.'}</p>
            {shop && (
              <div className="mk-badges">
                <span className="mk-badge" style={{ background: shop.status === 'APPROVED' ? '#2f9e6e' : 'rgba(255,255,255,.16)', color: '#fff' }}>{shop.status === 'APPROVED' ? 'Live' : shop.status === 'PENDING' ? 'Waiting for Nabz review' : shop.status === 'SUSPENDED' ? 'Suspended' : 'Not approved'}</span>
                {shop.isPaused && <span className="mk-badge" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>Paused</span>}
                {shop.rating.count > 0 && <span className="mk-badge" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>{shop.rating.avg.toFixed(1)} from {shop.rating.count} reviews</span>}
              </div>
            )}
          </div>
          <div className="art" style={{ maxWidth: 220 }}><CareArt kind={meta.art} /></div>
        </div>
      </section>
      {shop?.statusReason && shop.status !== 'APPROVED' && <p className="mk-note">{shop.statusReason}</p>}

      {kinds.length > 1 && (
        <div className="mk-chips" role="group" aria-label="Shop type">
          {kinds.map((k) => <button key={k} type="button" className="mk-chip" aria-pressed={kind === k} onClick={() => { setKind(k); setLoaded(false); }}>{KINDS[k === 'LAB' ? 'LAB' : k].label}</button>)}
        </div>
      )}

      {shop && (
        <div className="mk-chips" role="tablist" aria-label="Shop sections">
          {TABS.filter(([t]) => t !== 'team' || shop.format !== 'SOLO').map(([t, label]) => <button key={t} type="button" role="tab" className="mk-chip" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => go(t)}>{label}</button>)}
          <Link className="mk-chip" href="/partner/ads"><Megaphone size={14} aria-hidden="true" /> Ads</Link>
        </div>
      )}

      {(!shop || tab === 'profile') && kind && <ProfileForm kind={kind} shop={shop} onSaved={load} />}
      {shop && tab === 'menu' && <RateCardEditor shop={shop} rateCard={rateCard} onSaved={load} />}
      {shop && tab === 'team' && <TeamEditor kind={shop.kind} />}
      {shop && tab === 'leave' && <LeaveEditor shop={shop} onSaved={load} />}
      {shop && tab === 'plans' && <PlansList />}
    </div>
  );
}

// ── Profile, location and hours ──────────────────────────────────────────

type Range = { open: string; close: string };
const toRanges = (hours: DayHours[] | undefined) => Object.fromEntries(DAYS.map((d) => [d, (hours || []).filter((h) => h.day === d).map((h) => ({ open: h.open, close: h.close }))])) as Record<DayHours['day'], Range[]>;
const fromRanges = (r: Record<DayHours['day'], Range[]>): DayHours[] => DAYS.flatMap((d) => r[d].filter((x) => x.open && x.close).map((x) => ({ day: d, ...x })));

function HoursEditor({ label, value, onChange }: { label: string; value: Record<DayHours['day'], Range[]>; onChange: (v: Record<DayHours['day'], Range[]>) => void }) {
  const set = (d: DayHours['day'], i: number, k: 'open' | 'close', v: string) => onChange({ ...value, [d]: value[d].map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const copyMon = () => onChange(Object.fromEntries(DAYS.map((d) => [d, value.MON.map((r) => ({ ...r }))])) as typeof value);
  return (
    <fieldset className="mk-card" style={{ display: 'grid', gap: 10, border: 0, background: 'var(--card-alt)' }}>
      <legend className="mk-title" style={{ fontSize: 16, padding: 0, marginBottom: 6 }}>{label}</legend>
      {DAYS.map((d) => (
        <div key={d} className="mk-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ width: 44, fontWeight: 700 }}>{d.slice(0, 1) + d.slice(1).toLowerCase()}</span>
          {value[d].length === 0 && <span className="mk-meta grow">Closed</span>}
          {value[d].map((r, i) => (
            <span key={i} className="mk-row" style={{ gap: 6 }}>
              <input type="time" className="mk-input" style={{ width: 120, minHeight: 40 }} aria-label={`${d} opens`} value={r.open} onChange={(e) => set(d, i, 'open', e.target.value)} />
              <span aria-hidden="true">to</span>
              <input type="time" className="mk-input" style={{ width: 120, minHeight: 40 }} aria-label={`${d} closes`} value={r.close} onChange={(e) => set(d, i, 'close', e.target.value === '00:00' ? '23:59' : e.target.value)} />
              <button type="button" className="mk-icon-btn" style={{ width: 32, height: 32 }} aria-label={`Remove ${d} hours`} onClick={() => onChange({ ...value, [d]: value[d].filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden="true" /></button>
            </span>
          ))}
          {value[d].length < 2 && <button type="button" className="mk-btn soft small" onClick={() => onChange({ ...value, [d]: [...value[d], value[d].length ? { open: '17:00', close: '21:00' } : { open: '09:00', close: '19:00' }] })}><Plus size={13} aria-hidden="true" /> {value[d].length ? 'Second Shift' : 'Open'}</button>}
        </div>
      ))}
      <button type="button" className="mk-btn ghost small" style={{ justifySelf: 'start' }} onClick={copyMon}>Copy Monday to All Days</button>
      <p className="mk-help" style={{ margin: 0 }}>Night shifts: close at 23:59, and open the next day at 00:00.</p>
    </fieldset>
  );
}

function ProfileForm({ kind, shop, onSaved }: { kind: ShopKind; shop: MyShop | null; onSaved: () => void }) {
  const isLab = kind === 'LAB';
  const [f, setF] = useState(() => ({
    name: shop?.name || '',
    format: shop?.format || (isLab ? 'LAB' : 'SOLO'),
    regNumber: shop?.registration?.number || '',
    regBody: shop?.registration?.body || '',
    bio: shop?.bio || '',
    languages: (shop?.languages || []).join(', '),
    gender: shop?.gender || '',
    qualification: shop?.qualification || '',
    experienceYears: shop?.experienceYears ? String(shop.experienceYears) : '',
    line1: shop?.address?.line1 || '', city: shop?.address?.city || '', pincode: shop?.address?.pincode || '',
    lat: shop ? shop.location.coordinates[1] : NaN, lng: shop ? shop.location.coordinates[0] : NaN,
    clinicOn: shop ? shop.clinic.enabled : kind !== 'HOMECARE',
    capacity: String(shop?.clinic.capacity || 1),
    homeOn: shop ? shop.home.enabled : kind !== 'LAB',
    radiusKm: String(shop?.home.radiusKm || 8),
    ratePerKm: String(shop?.home.ratePerKm || 12),
    bufferMinutes: String(shop?.home.bufferMinutes ?? 30),
    homeCapacity: String(shop?.home.capacity || 1),
    freeAbove: String(shop?.home.freeCollectionAbove || 0)
  }));
  const [clinicHours, setClinicHours] = useState(() => toRanges(shop?.clinic.hours?.length ? shop.clinic.hours : DAYS.slice(0, 6).map((day) => ({ day, open: '09:00', close: '19:00' }))));
  const [homeHours, setHomeHours] = useState(() => toRanges(shop?.home.hours?.length ? shop.home.hours : DAYS.map((day) => ({ day, open: kind === 'HOMECARE' ? '00:00' : '08:00', close: kind === 'HOMECARE' ? '23:59' : '20:00' }))));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof f, v: string | boolean | number) => setF((x) => ({ ...x, [k]: v }));
  const pin = () => navigator.geolocation?.getCurrentPosition((p) => setF((x) => ({ ...x, lat: p.coords.latitude, lng: p.coords.longitude })), () => setMsg('Allow location access to pin your clinic or base.'), { enableHighAccuracy: true, timeout: 12000 });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const r = await api.saveMyShop({
        kind,
        name: f.name,
        format: f.format,
        registration: { number: f.regNumber || undefined, body: f.regBody || undefined },
        bio: f.bio,
        languages: f.languages.split(',').map((s) => s.trim()).filter(Boolean),
        gender: f.gender || undefined,
        qualification: f.qualification || undefined,
        experienceYears: f.experienceYears ? Number(f.experienceYears) : undefined,
        address: { line1: f.line1, city: f.city, pincode: f.pincode || undefined },
        ...(Number.isFinite(f.lat) ? { location: { lat: f.lat, lng: f.lng } } : {}),
        clinic: { enabled: f.clinicOn, capacity: Number(f.capacity) || 1, hours: fromRanges(clinicHours) },
        home: { enabled: f.homeOn, radiusKm: Number(f.radiusKm), ratePerKm: Number(f.ratePerKm), bufferMinutes: Number(f.bufferMinutes), capacity: Number(f.homeCapacity) || 1, hours: fromRanges(homeHours), ...(isLab ? { freeCollectionAbove: Number(f.freeAbove) || 0 } : {}) }
      });
      setMsg(r.warnings.length ? r.warnings.join(' ') : 'Saved.');
      onSaved();
    } catch (err) { setMsg(problem(err).message); } finally { setSaving(false); }
  };

  return (
    <form className="mk-card" onSubmit={save} style={{ display: 'grid', gap: 16 }} aria-labelledby="profile-title">
      <h2 id="profile-title" className="mk-title" style={{ fontSize: 20 }}><Store size={18} aria-hidden="true" /> Shop details</h2>
      <div className="mk-split">
        <div className="mk-field"><label htmlFor="s-name">{isLab ? 'Lab name' : 'Name customers see'}</label><input id="s-name" name="name" className="mk-input" required value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="organization" /></div>
        {!isLab && (
          <div className="mk-field"><label htmlFor="s-format">Type</label>
            <select id="s-format" className="mk-select" value={f.format} onChange={(e) => set('format', e.target.value)}>
              <option value="SOLO">Just me</option>
              <option value="CLINIC">{kind === 'HOMECARE' ? 'Agency with caregivers' : 'Clinic with a team'}</option>
            </select>
          </div>
        )}
      </div>
      <div className="mk-split">
        <div className="mk-field"><label htmlFor="s-reg">{isLab ? 'NABL certificate number' : 'Council registration number'}</label><input id="s-reg" name="registration" className="mk-input" autoComplete="off" spellCheck={false} value={f.regNumber} onChange={(e) => set('regNumber', e.target.value)} /></div>
        <div className="mk-field"><label htmlFor="s-body">{isLab ? 'Accrediting body' : 'Council'}</label><input id="s-body" name="registrationBody" className="mk-input" autoComplete="off" value={f.regBody} onChange={(e) => set('regBody', e.target.value)} placeholder={isLab ? 'NABL' : 'e.g. Rajasthan Physiotherapy Council'} /></div>
      </div>
      <div className="mk-field"><label htmlFor="s-bio">About you</label><textarea id="s-bio" name="bio" className="mk-textarea" maxLength={600} value={f.bio} onChange={(e) => set('bio', e.target.value)} placeholder="What you treat, your approach, special training…" /></div>
      {!isLab && (
        <div className="mk-split">
          <div className="mk-field"><label htmlFor="s-qual">Qualification</label><input id="s-qual" name="qualification" className="mk-input" autoComplete="off" value={f.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="BPT, MPT, GNM…" /></div>
          <div className="mk-field"><label htmlFor="s-exp">Years of experience</label><input id="s-exp" name="experience" className="mk-input" inputMode="numeric" autoComplete="off" value={f.experienceYears} onChange={(e) => set('experienceYears', e.target.value.replace(/\D/g, '').slice(0, 2))} /></div>
          <div className="mk-field"><label htmlFor="s-lang">Languages</label><input id="s-lang" name="languages" className="mk-input" autoComplete="off" value={f.languages} onChange={(e) => set('languages', e.target.value)} placeholder="Hindi, English" /></div>
          {f.format === 'SOLO' && <div className="mk-field"><label htmlFor="s-gender">Gender (shown to customers)</label><select id="s-gender" className="mk-select" value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">Prefer not to say</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></select></div>}
        </div>
      )}

      <div className="mk-card" style={{ background: 'var(--card-alt)', border: 0, display: 'grid', gap: 10 }}>
        <p className="mk-title" style={{ fontSize: 16 }}>Where you are</p>
        <div className="mk-split">
          <div className="mk-field"><label htmlFor="s-line1">Address</label><input id="s-line1" name="street-address" className="mk-input" autoComplete="street-address" value={f.line1} onChange={(e) => set('line1', e.target.value)} /></div>
          <div className="mk-field"><label htmlFor="s-city">City</label><input id="s-city" name="address-level2" className="mk-input" autoComplete="address-level2" value={f.city} onChange={(e) => set('city', e.target.value)} /></div>
        </div>
        <div className="mk-row" style={{ flexWrap: 'wrap' }}>
          <span className="grow mk-meta">{Number.isFinite(f.lat) ? `Pinned at ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : 'Not pinned yet. Stand at your clinic or base and pin it.'}</span>
          <button type="button" className="mk-btn ghost small" onClick={pin}><LocateFixed size={14} aria-hidden="true" /> Pin Here</button>
        </div>
        <p className="mk-help" style={{ margin: 0 }}>Customers see your clinic address. If you only do home visits, your pin stays private and is used only to measure travel.</p>
      </div>

      {kind !== 'HOMECARE' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="mk-row" style={{ gap: 8, fontWeight: 700 }}><input type="checkbox" checked={f.clinicOn} onChange={(e) => set('clinicOn', e.target.checked)} /> {isLab ? 'Walk-in at the lab' : 'Patients can visit my clinic'}</label>
          {f.clinicOn && (
            <>
              {f.format !== 'SOLO' && <div className="mk-field" style={{ maxWidth: 240 }}><label htmlFor="s-cap">{isLab ? 'Patients at once' : 'Patients at the same time (beds / physios)'}</label><input id="s-cap" type="number" min={1} max={20} className="mk-input" value={f.capacity} onChange={(e) => set('capacity', e.target.value)} /></div>}
              <HoursEditor label={isLab ? 'Lab hours' : 'Clinic hours'} value={clinicHours} onChange={setClinicHours} />
            </>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <label className="mk-row" style={{ gap: 8, fontWeight: 700 }}><input type="checkbox" checked={f.homeOn} onChange={(e) => set('homeOn', e.target.checked)} /> {isLab ? 'Home sample collection' : 'I go to patients’ homes'}</label>
        {f.homeOn && (
          <>
            <div className="mk-split">
              <div className="mk-field"><label htmlFor="s-radius">How far you travel (km)</label><input id="s-radius" type="number" min={1} max={25} className="mk-input" value={f.radiusKm} onChange={(e) => set('radiusKm', e.target.value)} /></div>
              <div className="mk-field"><label htmlFor="s-rate">Travel rate (₹ per km, 10–15)</label><input id="s-rate" type="number" min={10} max={15} step="0.5" className="mk-input" value={f.ratePerKm} onChange={(e) => set('ratePerKm', e.target.value)} /><span className="mk-help">Nabz measures the distance. Travel goes fully to you.</span></div>
              {kind !== 'HOMECARE' && <div className="mk-field"><label htmlFor="s-buffer">Minutes between home visits</label><input id="s-buffer" type="number" min={0} max={180} className="mk-input" value={f.bufferMinutes} onChange={(e) => set('bufferMinutes', e.target.value)} /></div>}
              {f.format !== 'SOLO' && <div className="mk-field"><label htmlFor="s-hcap">{isLab ? 'Phlebotomists out at once' : 'Home visits at the same time'}</label><input id="s-hcap" type="number" min={1} max={20} className="mk-input" value={f.homeCapacity} onChange={(e) => set('homeCapacity', e.target.value)} /></div>}
              {isLab && <div className="mk-field"><label htmlFor="s-free">Free collection above (₹, 0 = never)</label><input id="s-free" type="number" min={0} className="mk-input" value={f.freeAbove} onChange={(e) => set('freeAbove', e.target.value)} /></div>}
            </div>
            <HoursEditor label={kind === 'HOMECARE' ? 'When caregivers can start shifts' : isLab ? 'Collection hours' : 'Home-visit hours'} value={homeHours} onChange={setHomeHours} />
          </>
        )}
      </div>

      {msg && <p className={`mk-note ${msg === 'Saved.' ? 'green' : ''}`} role="status">{msg}</p>}
      <button type="submit" className="mk-btn" disabled={saving} style={{ justifySelf: 'start' }}><Save size={16} aria-hidden="true" /> {saving ? 'Saving…' : shop ? 'Save Changes' : 'Create My Shop'}</button>
    </form>
  );
}

// ── Rate card ────────────────────────────────────────────────────────────

function RateCardEditor({ shop, rateCard, onSaved }: { shop: MyShop; rateCard: MyRateCardItem[]; onSaved: () => void }) {
  const [catalog, setCatalog] = useState<MarketService[] | null>(null);
  useEffect(() => { api.marketServices(shop.kind).then((r) => setCatalog(r.services)).catch(() => setCatalog([])); }, [shop.kind]);
  const byService = useMemo(() => new Map(rateCard.map((r) => [r.service._id, r])), [rateCard]);
  if (!catalog) return <div className="mk-skel" style={{ minHeight: 200 }} />;
  return (
    <div className="mk-list">
      <p className="mk-note neutral">Set your price for each service you offer. Each service has a Nabz price range. Customers who book several sessions upfront get your multi-session discount.</p>
      {catalog.map((s) => <RateRow key={s._id} shop={shop} service={s} item={byService.get(s._id)} onSaved={onSaved} />)}
    </div>
  );
}

function RateRow({ shop, service, item, onSaved }: { shop: MyShop; service: MarketService; item?: MyRateCardItem; onSaved: () => void }) {
  const isHomecare = shop.kind === 'HOMECARE';
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(() => ({
    clinicOn: item ? item.clinic.enabled && item.isActive : false,
    clinicPrice: String(item?.clinic.price ?? ''),
    homeOn: item ? item.home.enabled && item.isActive : false,
    homePrice: String(item?.home.price ?? ''),
    duration: String(item?.durationMinutes || service.defaultDurationMinutes || 45),
    liveIn: Boolean(item?.liveIn),
    discounts: (item?.sessionDiscounts || []).map((d) => ({ minSessions: String(d.minSessions), percent: String(d.percent) })),
    offerPct: String(item?.offer?.percent || ''),
    offerMax: String(item?.offer?.maxDiscount || '')
  }));
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const active = Boolean(item && item.isActive && (item.clinic.enabled || item.home.enabled));
  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await api.saveRateCardItem(service._id, {
        kind: shop.kind,
        clinic: { enabled: f.clinicOn && !isHomecare && service.clinicAllowed, price: f.clinicPrice ? Number(f.clinicPrice) : undefined },
        home: { enabled: f.homeOn && service.homeAllowed, price: f.homePrice ? Number(f.homePrice) : undefined },
        durationMinutes: Number(f.duration),
        liveIn: f.liveIn,
        sessionDiscounts: f.discounts.filter((d) => d.minSessions && d.percent).map((d) => ({ minSessions: Number(d.minSessions), percent: Number(d.percent) }))
      });
      if (f.offerPct && f.offerMax && (!item?.offer || Number(f.offerPct) !== item.offer.percent || Number(f.offerMax) !== item.offer.maxDiscount)) {
        await api.setShopOffer(service._id, { percent: Number(f.offerPct), maxDiscount: Number(f.offerMax), kind: shop.kind });
      }
      setMsg(r.warnings.length ? r.warnings.join(' ') : 'Saved.');
      onSaved();
    } catch (e) { setMsg(problem(e).message); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `Stop offering ${service.displayName}?`, message: 'Booked sessions stay booked.', confirmLabel: 'Stop Offering', danger: true }))) return;
    try { const r = await api.removeRateCardItem(service._id, shop.kind); if (r.warnings.length) await alertDialog({ title: 'Removed', message: r.warnings.join(' ') }); onSaved(); } catch (e) { setMsg(problem(e).message); }
  };
  return (
    <article className="mk-card" style={{ padding: 14, display: 'grid', gap: 12, boxShadow: active ? 'inset 4px 0 0 var(--night)' : undefined }}>
      <div className="mk-row" style={{ flexWrap: 'wrap' }}>
        <div className="grow">
          <p className="mk-title" style={{ fontSize: 16 }}>{service.displayName}</p>
          <p className="mk-meta" style={{ margin: 0 }}>Nabz range {inr(service.priceFloor)} to {inr(service.priceCeiling)}{active ? ` · ${[item?.clinic.enabled ? `clinic ${inr(item.clinic.price)}` : '', item?.home.enabled ? `home ${inr(item.home.price)}` : ''].filter(Boolean).join(', ')} · ${hoursLabel(item!.durationMinutes)}` : ''}</p>
          {item?.offer && <span className={`mk-badge ${item.offer.status === 'APPROVED' ? 'green' : item.offer.status === 'REJECTED' ? 'red' : ''}`} style={{ marginTop: 6 }}><Tag size={12} aria-hidden="true" /> {item.offer.percent}% offer: {item.offer.status === 'PENDING' ? 'waiting for review' : item.offer.status.toLowerCase()}</span>}
        </div>
        <button type="button" className={`mk-btn ${active ? 'soft' : ''} small`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{active ? 'Edit' : 'Offer This'}</button>
      </div>
      {open && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="mk-split">
            {!isHomecare && service.clinicAllowed && (
              <div className="mk-field">
                <label className="mk-row" style={{ gap: 8 }}><input type="checkbox" checked={f.clinicOn} onChange={(e) => setF({ ...f, clinicOn: e.target.checked })} /> At the {shop.kind === 'LAB' ? 'lab' : 'clinic'}</label>
                {f.clinicOn && <input aria-label="Clinic price in rupees" className="mk-input" type="number" min={1} inputMode="decimal" value={f.clinicPrice} onChange={(e) => setF({ ...f, clinicPrice: e.target.value })} placeholder="₹" />}
              </div>
            )}
            {service.homeAllowed && (
              <div className="mk-field">
                <label className="mk-row" style={{ gap: 8 }}><input type="checkbox" checked={f.homeOn} onChange={(e) => setF({ ...f, homeOn: e.target.checked })} /> {shop.kind === 'LAB' ? 'Home collection' : 'At home'}</label>
                {f.homeOn && <input aria-label="Home price in rupees" className="mk-input" type="number" min={1} inputMode="decimal" value={f.homePrice} onChange={(e) => setF({ ...f, homePrice: e.target.value })} placeholder={f.clinicPrice ? `Same as clinic (${inr(Number(f.clinicPrice))})` : '₹'} />}
              </div>
            )}
          </div>
          {shop.kind !== 'LAB' && (
            <div className="mk-split">
              <div className="mk-field"><label htmlFor={`d-${service._id}`}>{isHomecare ? 'Shift length (minutes)' : 'Session length (minutes)'}</label><input id={`d-${service._id}`} className="mk-input" type="number" min={10} max={isHomecare ? 1440 : 480} value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></div>
              {isHomecare && Number(f.duration) === 1440 && <label className="mk-row" style={{ gap: 8, alignSelf: 'end' }}><input type="checkbox" checked={f.liveIn} onChange={(e) => setF({ ...f, liveIn: e.target.checked })} /> Live-in (travel charged once)</label>}
            </div>
          )}
          {shop.kind !== 'LAB' && (
            <div className="mk-field">
              <span className="mk-label">Discounts for plans paid upfront</span>
              {f.discounts.map((d, i) => (
                <div key={i} className="mk-row" style={{ gap: 6 }}>
                  <input aria-label="From sessions" className="mk-input" style={{ width: 110 }} type="number" min={2} value={d.minSessions} onChange={(e) => setF({ ...f, discounts: f.discounts.map((x, j) => (j === i ? { ...x, minSessions: e.target.value } : x)) })} placeholder="From" />
                  <span>sessions:</span>
                  <input aria-label="Percent off" className="mk-input" style={{ width: 90 }} type="number" min={1} max={30} value={d.percent} onChange={(e) => setF({ ...f, discounts: f.discounts.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)) })} placeholder="%" />
                  <span>% off</span>
                  <button type="button" className="mk-icon-btn" style={{ width: 32, height: 32 }} aria-label="Remove discount" onClick={() => setF({ ...f, discounts: f.discounts.filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden="true" /></button>
                </div>
              ))}
              {f.discounts.length < 3 && <button type="button" className="mk-btn soft small" style={{ justifySelf: 'start' }} onClick={() => setF({ ...f, discounts: [...f.discounts, { minSessions: f.discounts.length ? '10' : '5', percent: f.discounts.length ? '10' : '5' }] })}><Plus size={13} aria-hidden="true" /> Add Discount</button>}
            </div>
          )}
          <div className="mk-field">
            <span className="mk-label">New-customer offer (you fund it, Nabz reviews it)</span>
            <div className="mk-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <input aria-label="Offer percent" className="mk-input" style={{ width: 90 }} type="number" min={5} max={50} value={f.offerPct} onChange={(e) => setF({ ...f, offerPct: e.target.value })} placeholder="%" />
              <span>% off the first session, up to</span>
              <input aria-label="Maximum discount in rupees" className="mk-input" style={{ width: 110 }} type="number" min={1} value={f.offerMax} onChange={(e) => setF({ ...f, offerMax: e.target.value })} placeholder="₹" />
              {item?.offer && <button type="button" className="mk-btn ghost small" onClick={async () => { await api.removeShopOffer(service._id, shop.kind); onSaved(); }}>Remove Offer</button>}
            </div>
          </div>
          {msg && <p className={`mk-note ${msg === 'Saved.' ? 'green' : ''}`} role="status">{msg}</p>}
          <div className="mk-row" style={{ gap: 8 }}>
            <button type="button" className="mk-btn small" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Service'}</button>
            {active && <button type="button" className="mk-btn ghost small" onClick={remove}>Stop Offering</button>}
          </div>
        </div>
      )}
    </article>
  );
}

// ── Team, leave, plans ───────────────────────────────────────────────────

function TeamEditor({ kind }: { kind: ShopKind }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [who, setWho] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api.myTeam(kind).then((r) => setMembers(r.members)).catch((e) => setMsg(problem(e).message)), [kind]);
  useEffect(() => { load(); }, [load]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      const v = who.trim();
      const r = await api.addTeamMember(v.includes('@') ? { email: v, kind } : { phone: v, kind });
      setMembers(r.members);
      setWho('');
    } catch (err) { setMsg(problem(err).message); }
  };
  const remove = async (m: TeamMember) => {
    if (!(await confirmDialog({ title: `Remove ${m.name}?`, message: 'Their upcoming sessions go back to the families to move or cancel for free.', confirmLabel: 'Remove', danger: true }))) return;
    try { const r = await api.removeTeamMember(m.user, kind); setMembers(r.members); if (r.released) setMsg(`${r.released} upcoming sessions were released to the families.`); } catch (err) { setMsg(problem(err).message); }
  };
  return (
    <section className="mk-card" style={{ display: 'grid', gap: 14 }} aria-labelledby="team-title">
      <h2 id="team-title" className="mk-title" style={{ fontSize: 20 }}><Users size={18} aria-hidden="true" /> Team</h2>
      <p className="mk-meta" style={{ margin: 0 }}>Each home booking gets one named person for every day. Add verified Nabz partners by their phone or email.</p>
      <form onSubmit={add} className="mk-row" style={{ flexWrap: 'wrap' }}>
        <input aria-label="Phone or email of the team member" className="mk-input grow" style={{ flex: '1 1 240px' }} value={who} onChange={(e) => setWho(e.target.value)} placeholder="98765… or name@email.com" autoComplete="off" spellCheck={false} />
        <button type="submit" className="mk-btn" disabled={!who.trim()}><Plus size={15} aria-hidden="true" /> Add</button>
      </form>
      {msg && <p className="mk-note" role="status">{msg}</p>}
      {!members && <div className="mk-skel" />}
      <div className="mk-list">
        {(members || []).map((m) => (
          <div key={m.user} className="mk-row" style={{ padding: '8px 0', opacity: m.active ? 1 : 0.5 }}>
            <span className="mk-avatar" style={{ width: 40, height: 40, borderRadius: 14, fontSize: 16 }} aria-hidden="true">{(m.name || '?')[0]}</span>
            <div className="grow"><strong>{m.name}</strong><p className="mk-meta" style={{ margin: 0 }}>{m.role.toLowerCase()}{m.qualification ? ` · ${m.qualification}` : ''}{m.active ? '' : ' · removed'}</p></div>
            {m.active && m.role !== 'MANAGER' && <button type="button" className="mk-btn ghost small" onClick={() => remove(m)}>Remove</button>}
          </div>
        ))}
      </div>
    </section>
  );
}

function LeaveEditor({ shop, onSaved }: { shop: MyShop; onSaved: () => void }) {
  const [from, setFrom] = useState(todayIst());
  const [to, setTo] = useState(todayIst());
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const pause = async () => {
    try { await api.pauseShop(!shop.isPaused, shop.kind); onSaved(); } catch (e) { setMsg(problem(e).message); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await confirmDialog({ title: 'Add this leave?', message: 'Sessions already booked on these days go back to the customers to move or cancel for free.', confirmLabel: 'Add Leave' }))) return;
    try { const r = await api.addShopLeave({ from, to, reason: reason || undefined, kind: shop.kind }); setMsg(r.released ? `${r.released} booked sessions were released.` : 'Leave added.'); onSaved(); } catch (err) { setMsg(problem(err).message); }
  };
  return (
    <div className="mk-grid two">
      <section className={`mk-card ${shop.isPaused ? '' : 'red'}`} style={{ display: 'grid', gap: 12 }} aria-labelledby="pause-title">
        <h2 id="pause-title" className="mk-title" style={{ fontSize: 20 }}>{shop.isPaused ? 'Your shop is paused' : 'Taking new bookings'}</h2>
        <p className="mk-meta" style={{ margin: 0 }}>{shop.isPaused ? 'Customers can’t book you right now. Booked sessions stay.' : 'Pause when you’re too busy. Booked sessions stay booked.'}</p>
        <button type="button" className={`mk-btn ${shop.isPaused ? '' : 'dark'}`} onClick={pause}>{shop.isPaused ? <><PlayCircle size={16} aria-hidden="true" /> Start Taking Bookings</> : <><PauseCircle size={16} aria-hidden="true" /> Pause New Bookings</>}</button>
      </section>
      <section className="mk-card" style={{ display: 'grid', gap: 12 }} aria-labelledby="leave-title">
        <h2 id="leave-title" className="mk-title" style={{ fontSize: 20 }}><CalendarOff size={18} aria-hidden="true" /> Days off</h2>
        <form onSubmit={add} style={{ display: 'grid', gap: 10 }}>
          <div className="mk-split">
            <div className="mk-field"><label htmlFor="l-from">From</label><input id="l-from" type="date" className="mk-input" min={todayIst()} value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></div>
            <div className="mk-field"><label htmlFor="l-to">To</label><input id="l-to" type="date" className="mk-input" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="mk-field"><label htmlFor="l-reason">Reason (only you see it)</label><input id="l-reason" className="mk-input" maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" /></div>
          <button type="submit" className="mk-btn small" style={{ justifySelf: 'start' }}>Add Leave</button>
        </form>
        {msg && <p className="mk-note" role="status">{msg}</p>}
        {shop.leave.map((l) => (
          <div key={l._id} className="mk-row">
            <span className="grow">{fmtDay(l.from)}{l.to !== l.from ? ` to ${fmtDay(l.to)}` : ''}{l.reason ? ` · ${l.reason}` : ''}</span>
            <button type="button" className="mk-icon-btn" style={{ width: 32, height: 32 }} aria-label="Remove leave" onClick={async () => { await api.removeShopLeave(l._id, shop.kind); onSaved(); }}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
        ))}
        {(shop.strikes || []).length > 0 && <p className="mk-help" style={{ margin: 0 }}>{shop.strikes!.length} reliability strike{shop.strikes!.length > 1 ? 's' : ''}. Three in 30 days pause new bookings.</p>}
      </section>
    </div>
  );
}

function PlansList() {
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.myShopPlans>>['plans'] | null>(null);
  useEffect(() => { api.myShopPlans().then((r) => setPlans(r.plans)).catch(() => setPlans([])); }, []);
  if (!plans) return <div className="mk-skel" />;
  if (!plans.length) return <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>No active plans yet</strong><span>When customers book you, their plans show here. Today’s visits are on your <Link href="/staff">visits page</Link>.</span></div>;
  return (
    <div className="mk-grid">
      {plans.map((p) => (
        <article key={p._id} className="mk-card" style={{ display: 'grid', gap: 6 }}>
          <p className="mk-title">{p.serviceName}</p>
          <p className="mk-meta" style={{ margin: 0 }}>{p.patientDetails?.name || 'Customer'}{p.city ? ` · ${p.city}` : ''} · {p.mode === 'HOME' ? 'home' : 'clinic'}</p>
          <div className="mk-row" style={{ justifyContent: 'space-between' }}>
            <span className={`mk-badge ${p.status === 'ACTIVE' ? 'green' : 'red'}`}>{p.status === 'ACTIVE' ? 'Active' : 'Waiting for payment'}</span>
            <strong>{p.sessionsCompleted}/{p.sessionsTotal}</strong>
          </div>
          <p className="mk-help" style={{ margin: 0 }}><BadgeCheck size={12} aria-hidden="true" /> {p.paymentMode === 'PREPAID' ? 'Paid upfront: you’re paid after each session' : 'Collect after each session'}</p>
        </article>
      ))}
    </div>
  );
}
