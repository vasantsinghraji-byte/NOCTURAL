'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ChevronRight, FlaskConical, LayoutGrid, Map as MapIcon, Pill, Radio, Search, X, type LucideIcon } from 'lucide-react';
import type { CareService } from '@medrush/shared';
import { api } from '@/lib/api';
import { loadDeliveryCoords, saveDeliveryCoords, type Coords } from '@/lib/location';
import { serviceIcon } from '../_components/icons';
import { Modal } from '../_components/Dialog';
import UpdatesFeed from '../_components/UpdatesFeed';

const DEMO: Coords = { lat: 26.9110, lng: 75.8010 }; // launch city: Jaipur
const GRID_MAX = 8; // two rows of four before "See all"
const short = (s: CareService) => (s.displayName || s.name).replace(/ at Home| \(.*\)|Session/g, '').trim();

const MORE: Array<{ href: string; icon: LucideIcon; title: string; sub: string; bg: string; fg: string }> = [
  { href: '/pharmacy', icon: Pill, title: 'Pharmacy', sub: 'Medicines in 30 min', bg: 'var(--mint-soft)', fg: 'var(--mint)' },
  { href: '/lab-tests', icon: FlaskConical, title: 'Lab tests', sub: 'Sample from home', bg: 'var(--sky-soft)', fg: 'var(--sky)' },
  { href: '/care', icon: Activity, title: 'Physio & care', sub: 'Compare near you', bg: 'var(--violet-soft)', fg: 'var(--violet)' }
];

/**
 * Web-app home (same layout as the app): where, search, who's online with the
 * map a click away, every nursing service in a grid, then the rest of Nabz.
 */
export default function BookPage() {
  const [services, setServices] = useState<CareService[] | null>(null);
  const [point, setPoint] = useState<Coords>(DEMO);
  const [located, setLocated] = useState(false);
  const [nearby, setNearby] = useState<{ count: number; nearestKm: number | null }>({ count: 0, nearestKm: null });
  const [query, setQuery] = useState('');
  const [allOpen, setAllOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    api.listCareServices().then((r) => setServices(r.services)).catch(() => setServices([]));
    const saved = loadDeliveryCoords();
    if (saved) { setPoint(saved); setLocated(true); return; }
    navigator.geolocation?.getCurrentPosition(
      (pos) => { const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }; saveDeliveryCoords(c); setPoint(c); setLocated(true); },
      () => undefined,
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    const load = () => api.getNearbyStaff({ ...point, radiusKm: 10 }).then((r) => setNearby({ count: r.count, nearestKm: r.nearestKm })).catch(() => undefined);
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [point]);

  const nursing = useMemo(() => (services || []).filter((s) => s.category !== 'PACKAGE'), [services]);
  const packages = useMemo(() => (services || []).filter((s) => s.category === 'PACKAGE'), [services]);
  const q = query.trim().toLowerCase();
  const matches = q ? nursing.filter((s) => `${s.displayName} ${s.name} ${s.shortDescription || ''}`.toLowerCase().includes(q)) : nursing;
  const hasMore = !q && matches.length > GRID_MAX;
  const grid = hasMore ? matches.slice(0, GRID_MAX - 1) : matches;
  const liveLine = nearby.count
    ? `${nearby.count} verified staff online near you${nearby.nearestKm !== null ? ` · nearest ${nearby.nearestKm} km` : ''}`
    : 'No staff online nearby. Schedule and we’ll assign one.';
  const d = 0.012;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${point.lng - d * 1.6},${point.lat - d},${point.lng + d * 1.6},${point.lat + d}&layer=mapnik&marker=${point.lat},${point.lng}`;

  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 16, maxWidth: 880 }}>
      <div className="mk-row" style={{ gap: 10 }}>
        <div className="where grow" style={{ background: 'transparent', padding: '4px 0' }}>
          <span className="dot" aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className="muted">Care at</div>
            <b>{located ? 'Your current location' : 'C-Scheme, Jaipur (demo)'}</b>
          </div>
        </div>
        <button type="button" className="mk-icon-btn" onClick={() => setMapOpen(true)} aria-label="See professionals near you on the map" style={{ width: 48, height: 48 }}>
          <MapIcon size={22} aria-hidden="true" />
        </button>
      </div>

      <label className="mk-row mk-card" style={{ padding: '2px 14px', gap: 10 }}>
        <Search size={18} aria-hidden="true" />
        <input className="mk-input" style={{ border: 0, padding: 0 }} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search injections, dressing, physio…" aria-label="Search services" autoComplete="off" spellCheck={false} />
        {query && <button type="button" className="mk-icon-btn" onClick={() => setQuery('')} aria-label="Clear search"><X size={16} aria-hidden="true" /></button>}
      </label>

      <button type="button" onClick={() => setMapOpen(true)} className="mk-row"
        style={{ border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', padding: '10px 14px', borderRadius: 14, minHeight: 44, background: nearby.count ? 'var(--mint-soft)' : 'var(--card-alt)', color: nearby.count ? 'var(--mint)' : 'var(--muted)', fontWeight: 600, fontSize: 14 }}>
        <Radio size={15} aria-hidden="true" />
        <span className="grow">{liveLine}</span>
        <span style={{ fontWeight: 700 }}>Map</span><ChevronRight size={15} aria-hidden="true" />
      </button>

      <div className="mk-toolbar" style={{ margin: '10px 0 0' }}>
        <h1 className="mk-h2" style={{ margin: 0 }}>{q ? `Results for “${query.trim()}”` : 'Nurse at home'}</h1>
        {!q && nursing.length > 0 && <button type="button" className="linkish" onClick={() => setAllOpen(true)}>See all</button>}
      </div>
      <div className="svc-grid">
        {services === null && Array.from({ length: GRID_MAX }).map((_, i) => <div key={i} className="mk-skel" style={{ minHeight: 104 }} />)}
        {grid.map((s) => <ServiceTile key={s.serviceType} service={s} />)}
        {hasMore && (
          <button type="button" className="svc-tile" onClick={() => setAllOpen(true)}>
            <span className="ic" style={{ background: 'var(--card-alt)', color: 'var(--ink-soft)' }}><LayoutGrid size={26} aria-hidden="true" /></span>
            See all
          </button>
        )}
        {q && matches.length === 0 && <p className="muted">No service matches “{query.trim()}”.</p>}
      </div>

      <div className="svc-more">
        {MORE.map((m) => (
          <Link key={m.href} href={m.href} className="svc-more-tile" style={{ background: m.bg }}>
            <m.icon size={26} color={m.fg} aria-hidden="true" />
            <b>{m.title}</b>
            <span>{m.sub}</span>
          </Link>
        ))}
      </div>

      <UpdatesFeed audience="customer" />

      {allOpen && (
        <Modal onClose={() => setAllOpen(false)} labelledBy="all-services" wide>
          <div style={{ display: 'grid', gap: 10 }}>
            <h2 id="all-services" style={{ margin: 0 }}>All services</h2>
            <b className="muted">Nurse at home</b>
            <div className="svc-grid">{nursing.map((s) => <ServiceTile key={s.serviceType} service={s} />)}</div>
            {packages.length > 0 && (
              <>
                <b className="muted">Care packages</b>
                <div className="svc-grid">{packages.map((s) => <ServiceTile key={s.serviceType} service={s} />)}</div>
              </>
            )}
            <button type="button" className="mk-btn soft" onClick={() => setAllOpen(false)}>Close</button>
          </div>
        </Modal>
      )}

      {mapOpen && (
        <Modal onClose={() => setMapOpen(false)} labelledBy="near-map" wide>
          <div style={{ display: 'grid', gap: 10 }}>
            <h2 id="near-map" style={{ margin: 0 }}>Near you</h2>
            <p className="muted" style={{ margin: 0 }}>{liveLine}. Exact positions of professionals are hidden for their safety.</p>
            <div style={{ position: 'relative', height: 'min(60vh, 460px)', borderRadius: 20, overflow: 'hidden' }}>
              <iframe title="Map of your area" src={mapSrc} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
            <button type="button" className="mk-btn soft" onClick={() => setMapOpen(false)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ServiceTile({ service }: { service: CareService }) {
  const Icon = serviceIcon(service.serviceType);
  return (
    <Link href={`/nursing?service=${service.serviceType}`} className="svc-tile" aria-label={service.displayName || service.name}>
      <span className="ic"><Icon size={28} aria-hidden="true" /></span>
      {short(service)}
    </Link>
  );
}
