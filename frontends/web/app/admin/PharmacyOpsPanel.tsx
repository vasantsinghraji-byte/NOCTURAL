'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminFlaggedOrder, AdminZone, H1RegisterRow } from '@medrush/shared';
import { api } from '@/lib/api';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
const TABS = [['zones', 'Delivery zones'], ['flagged', 'Flagged orders'], ['h1', 'H1 register'], ['add', 'Add a pharmacy']] as const;
type Tab = typeof TABS[number][0];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const when = (d?: string) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-');
const err = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Pharmacy operations the server already supports: zones, risk review, the H1 register, new stores. */
export default function PharmacyOpsPanel({ sensitive }: { sensitive: Sensitive }) {
  const [tab, setTab] = useState<Tab>('zones');
  return (
    <section className="admin-section" style={{ marginTop: 18 }}>
      <div className="mk-seg" role="tablist" aria-label="Pharmacy operations" style={{ justifySelf: 'start', flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === 'zones' && <Zones sensitive={sensitive} />}
      {tab === 'flagged' && <Flagged />}
      {tab === 'h1' && <H1Register />}
      {tab === 'add' && <AddPharmacy sensitive={sensitive} />}
    </section>
  );
}

function Zones({ sensitive }: { sensitive: Sensitive }) {
  const [zones, setZones] = useState<AdminZone[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ code: '', name: '', city: 'Jaipur', maxLastMileKm: '6', boundary: '' });
  const load = useCallback(() => api.adminZones().then((r) => setZones(r.zones)).catch((e) => setError(err(e))), []);
  useEffect(() => { load(); }, [load]);

  const update = (z: AdminZone, body: Parameters<typeof api.adminUpdateZone>[1], done: string) => sensitive(async () => {
    setError(null);
    await api.adminUpdateZone(z._id, body);
    setNotice(`${z.name}: ${done}`);
    await load();
  });

  function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let boundary: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] };
    try {
      const parsed = JSON.parse(draft.boundary);
      boundary = parsed.type === 'Feature' ? parsed.geometry : parsed.type === 'FeatureCollection' ? parsed.features?.[0]?.geometry : parsed;
      if (!boundary || !['Polygon', 'MultiPolygon'].includes(boundary.type)) throw new Error('shape');
    } catch {
      setError('Paste a GeoJSON Polygon (draw the area at geojson.io and copy the JSON).');
      return;
    }
    sensitive(async () => {
      await api.adminCreateZone({ code: draft.code.trim(), name: draft.name.trim(), city: draft.city.trim(), boundary, maxLastMileKm: Number(draft.maxLastMileKm) || undefined });
      setNotice(`${draft.name} added.`);
      setAdding(false);
      setDraft({ code: '', name: '', city: draft.city, maxLastMileKm: '6', boundary: '' });
      await load();
    });
  }

  return (
    <div className="admin-section">
      <p className="muted" style={{ margin: 0 }}>Zones decide where stores deliver. Surge shrinks how far stores deliver so riders stay close; set it by hand here (it wins over the automatic level until it ends), or pause a zone to stop deliveries into it.</p>
      {notice && <div className="notice good" role="status">{notice}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}
      {!adding && <button className="btn secondary" style={{ justifySelf: 'start' }} onClick={() => setAdding(true)}>Add a zone</button>}
      {adding && (
        <form className="card admin-card" onSubmit={create}>
          <h3 style={{ marginTop: 0 }}>New delivery zone</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <div><label htmlFor="z-code">Code</label><input id="z-code" className="input mono" required pattern="[A-Za-z0-9_\-]{2,40}" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="JPR-CSCHEME" /></div>
            <div><label htmlFor="z-name">Name</label><input id="z-name" className="input" required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="C-Scheme" /></div>
            <div><label htmlFor="z-city">City</label><input id="z-city" className="input" required value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></div>
            <div><label htmlFor="z-km">Furthest delivery (km)</label><input id="z-km" className="input" type="number" min={0.5} max={50} step={0.5} value={draft.maxLastMileKm} onChange={(e) => setDraft({ ...draft, maxLastMileKm: e.target.value })} /></div>
          </div>
          <label htmlFor="z-geo" style={{ marginTop: 10, display: 'block' }}>Area (GeoJSON Polygon)</label>
          <textarea id="z-geo" className="input mono" rows={5} required value={draft.boundary} onChange={(e) => setDraft({ ...draft, boundary: e.target.value })} placeholder='{"type":"Polygon","coordinates":[[[75.79,26.90],[75.82,26.90],[75.82,26.93],[75.79,26.93],[75.79,26.90]]]}' />
          <small className="muted">Draw the area at geojson.io, then copy the JSON here. Longitude comes first.</small>
          <div className="review-actions">
            <button className="btn" type="submit">Add zone</button>
            <button className="btn secondary" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
      {!zones && !error && <p className="muted">Loading zones…</p>}
      {zones && zones.length === 0 && <p className="muted">No zones yet.</p>}
      <div className="team-grid">
        {zones?.map((z) => <ZoneCard key={z._id} zone={z} update={update} />)}
      </div>
    </div>
  );
}

function ZoneCard({ zone: z, update }: { zone: AdminZone; update: (z: AdminZone, body: Parameters<typeof api.adminUpdateZone>[1], done: string) => Promise<void> }) {
  const [level, setLevel] = useState<'NORMAL' | 'HIGH' | 'SEVERE'>(z.stress?.level || 'NORMAL');
  const [hours, setHours] = useState('2');
  const [reason, setReason] = useState('');
  const until = () => new Date(Date.now() + (Number(hours) || 2) * 3600000).toISOString();
  return (
    <article className="card admin-card team-card">
      <div className="row">
        <div><h3 style={{ margin: 0 }}>{z.name}</h3><span className="muted mono">{z.code} · {z.city}</span></div>
        <span className={`pill ${z.isActive ? 'mint' : 'rx'}`}>{z.isActive ? 'Delivering' : 'Paused'}</span>
      </div>
      <dl className="kv compact">
        <dt>Surge</dt><dd>{z.stress?.level || 'NORMAL'}{z.stress?.until ? ` until ${when(z.stress.until)}` : ''}{z.stress?.reason ? ` · ${z.stress.reason}` : ''}</dd>
        <dt>Furthest delivery</dt><dd>{z.maxLastMileKm ? `${z.maxLastMileKm} km` : 'Store radius'}</dd>
      </dl>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label htmlFor={`lv-${z._id}`}>Set surge</label>
          <select id={`lv-${z._id}`} className="input" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="SEVERE">Severe</option>
          </select>
        </div>
        <div><label htmlFor={`hr-${z._id}`}>For (hours)</label><input id={`hr-${z._id}`} className="input" type="number" min={1} max={48} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
      </div>
      <input className="input" aria-label="Reason" maxLength={200} placeholder="Reason (e.g. heavy rain)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="review-actions">
        <button className="btn" onClick={() => update(z, { stress: { level, reason: reason.trim() || undefined, until: until() } }, `surge set to ${level.toLowerCase()} for ${hours} h.`)}>Apply surge</button>
        <button className={`btn secondary ${z.isActive ? 'danger' : ''}`} onClick={() => update(z, { isActive: !z.isActive }, z.isActive ? 'deliveries paused.' : 'deliveries back on.')}>{z.isActive ? 'Pause zone' : 'Resume zone'}</button>
      </div>
    </article>
  );
}

function Flagged() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<AdminFlaggedOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setRows(null); api.adminFlaggedOrders(days).then((r) => setRows(r.orders)).catch((e) => setError(err(e))); }, [days]);
  return (
    <div className="admin-section">
      <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
        <p className="muted" style={{ margin: 0 }}>Orders the rules flagged for a look: monthly limits crossed, unusual quantities, repeated prescriptions.</p>
        <select className="input" style={{ width: 'auto' }} aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">Nothing flagged in this period.</p>}
      <div className="team-grid">
        {rows?.map((o) => (
          <article key={o._id} className="card admin-card team-card">
            <div className="row"><h3 style={{ margin: 0 }} className="mono">{o.orderNumber}</h3><span className="pill">{o.status}</span></div>
            <span className="muted">{when(o.createdAt)} · {o.vendor?.name || 'Store'} · {o.patient?.name || 'Customer'}</span>
            <div className="access-chips">{o.riskFlags.map((f, i) => <span key={i} className="access-chip kind" title={f.detail}>{f.code.replace(/_/g, ' ').toLowerCase()}</span>)}</div>
            <span className="muted">{o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</span>
            <a className="btn secondary" style={{ justifySelf: 'start' }} href={api.prescriptionLink(o._id, 'admin')} target="_blank" rel="noopener noreferrer">Open prescription</a>
          </article>
        ))}
      </div>
    </div>
  );
}

function H1Register() {
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(ymd(new Date()));
  const [rows, setRows] = useState<H1RegisterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { setRows(null); setError(null); api.adminH1Register({ from, to }).then((r) => setRows(r.rows)).catch((e) => setError(err(e))); }, [from, to]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="admin-section">
      <p className="muted" style={{ margin: 0 }}>Schedule H1 drugs supplied through Nabz, as the register requires: who, what, which batch and the prescriber. Keep a copy for three years.</p>
      <div className="row" style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <label htmlFor="h1-from">From</label><input id="h1-from" className="input" type="date" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <label htmlFor="h1-to">To</label><input id="h1-to" className="input" type="date" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
        <a className="btn" href={api.adminH1RegisterLink(from, to)}>Download CSV</a>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">No Schedule H1 supplies in this period.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Supplied</th><th>Order</th><th>Store</th><th>Patient</th><th>Prescriber</th><th>Drug</th><th>Batches</th><th>Qty</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{when(r.suppliedOn)}</td><td className="mono">{r.orderNumber}</td><td>{r.store}</td><td>{r.patientName}</td><td>{r.prescriberName}{r.prescriberRegistration ? ` (${r.prescriberRegistration})` : ''}</td><td>{r.drug}</td><td className="mono">{r.batches}</td><td>{r.quantity}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddPharmacy({ sensitive }: { sensitive: Sensitive }) {
  const empty = { name: '', contactPhone: '', contactEmail: '', drugLicenseNumber: '', gstin: '', line1: '', city: 'Jaipur', pincode: '', lat: '', lng: '', serviceRadiusKm: '5', deliveryFee: '', minOrderValue: '', hasColdStorage: false };
  const [d, setD] = useState(empty);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const lat = Number(d.lat);
    const lng = Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) { setError('Enter the store’s latitude and longitude (from Google Maps).'); return; }
    sensitive(async () => {
      const r = await api.adminCreateVendor({
        name: d.name.trim(), contactPhone: d.contactPhone.trim() || undefined, contactEmail: d.contactEmail.trim() || undefined,
        drugLicenseNumber: d.drugLicenseNumber.trim() || undefined, gstin: d.gstin.trim() || undefined,
        address: { line1: d.line1.trim(), city: d.city.trim(), pincode: d.pincode.trim() },
        location: { coordinates: [lng, lat] }, serviceRadiusKm: Number(d.serviceRadiusKm) || undefined,
        deliveryFee: d.deliveryFee ? Number(d.deliveryFee) : undefined, minOrderValue: d.minOrderValue ? Number(d.minOrderValue) : undefined,
        hasColdStorage: d.hasColdStorage
      });
      setNotice(`${r.vendor.name} added as PENDING. Approve it in the store list once its licence is checked, then link the owner's login.`);
      setD(empty);
    });
  }
  const field = (k: keyof typeof empty, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label htmlFor={`ap-${k}`}>{label}</label><input id={`ap-${k}`} className="input" value={String(d[k])} onChange={set(k)} {...extra} /></div>
  );
  return (
    <form className="card admin-card" onSubmit={save}>
      <h3 style={{ marginTop: 0 }}>Add a pharmacy</h3>
      <p className="muted" style={{ marginTop: 0 }}>For stores signed up offline. It starts as PENDING and takes no orders until you approve it.</p>
      {notice && <div className="notice good" role="status">{notice}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {field('name', 'Store name', { required: true, maxLength: 120 })}
        {field('contactPhone', 'Phone', { inputMode: 'numeric', maxLength: 10 })}
        {field('contactEmail', 'Email', { type: 'email' })}
        {field('drugLicenseNumber', 'Drug licence no.')}
        {field('gstin', 'GSTIN', { maxLength: 15 })}
        {field('line1', 'Address', { required: true })}
        {field('city', 'City', { required: true })}
        {field('pincode', 'Pincode', { required: true, pattern: '[0-9]{6}', inputMode: 'numeric', maxLength: 6 })}
        {field('lat', 'Latitude', { required: true, inputMode: 'decimal', placeholder: '26.9124' })}
        {field('lng', 'Longitude', { required: true, inputMode: 'decimal', placeholder: '75.7873' })}
        {field('serviceRadiusKm', 'Delivers within (km)', { type: 'number', min: 1, max: 25 })}
        {field('deliveryFee', 'Own delivery fee (₹, optional)', { type: 'number', min: 0 })}
        {field('minOrderValue', 'Minimum order (₹, optional)', { type: 'number', min: 0 })}
      </div>
      <label className="check-row" htmlFor="ap-cold" style={{ marginTop: 8 }}>
        <input id="ap-cold" type="checkbox" checked={d.hasColdStorage} onChange={set('hasColdStorage')} />
        <span><strong>Has cold storage</strong><small>Can stock insulin and other refrigerated medicines.</small></span>
      </label>
      <div className="review-actions"><button className="btn" type="submit">Add pharmacy</button></div>
    </form>
  );
}
