'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeIndianRupee, CalendarClock, FlaskConical, HandCoins, ShieldCheck, Store, Tag, Users } from 'lucide-react';
import type { MarketplaceOverview, ShopKind } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, todayIst, fmtDay, fmtTime, KINDS } from '@/lib/care';
import { promptDialog, confirmDialog } from '../_components/Dialog';
import CallbacksPanel from './CallbacksPanel';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
const SUBTABS = [['overview', 'Today'], ['callbacks', 'Call-backs'], ['shops', 'Shops'], ['catalog', 'Catalog'], ['refunds', 'Refunds'], ['reports', 'Reported visits'], ['labs', 'Lab orders'], ['offers', 'Offers']] as const;
type Sub = typeof SUBTABS[number][0];

/** Care marketplace operations (docs/product/ADMIN_AND_ADS_GUIDE.md, Part 1). */
export default function MarketplacePanel({ sensitive }: { sensitive: Sensitive }) {
  const [sub, setSub] = useState<Sub>('overview');
  const [overview, setOverview] = useState<MarketplaceOverview | null>(null);
  const refreshOverview = useCallback(() => api.adminMarketOverview().then((r) => setOverview(r.overview)).catch(() => undefined), []);
  useEffect(() => { refreshOverview(); }, [refreshOverview, sub]);
  const badge: Partial<Record<Sub, number>> = overview ? { shops: overview.shopsPending, refunds: overview.refundsPending, reports: overview.reports, labs: overview.labLate, offers: overview.offersPending, callbacks: overview.callbacksOpen } : {};
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="mk-chips" role="tablist" aria-label="Marketplace sections">
        {SUBTABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={sub === k} aria-pressed={sub === k} className="mk-chip" onClick={() => setSub(k)}>
            {label}{badge[k] ? <span className="mk-badge red" style={{ padding: '3px 7px' }}>{badge[k]}</span> : null}
          </button>
        ))}
      </div>
      {sub === 'overview' && <Today overview={overview} />}
      {sub === 'callbacks' && <CallbacksPanel sensitive={sensitive} />}
      {sub === 'shops' && <Shops sensitive={sensitive} />}
      {sub === 'catalog' && <Catalog sensitive={sensitive} />}
      {sub === 'refunds' && <Refunds sensitive={sensitive} />}
      {sub === 'reports' && <Reports sensitive={sensitive} />}
      {sub === 'labs' && <Labs />}
      {sub === 'offers' && <Offers sensitive={sensitive} />}
    </div>
  );
}

function Tile({ icon, label, value, red }: { icon: React.ReactNode; label: string; value: number | string; red?: boolean }) {
  return (
    <div className={`mk-card ${red ? 'red' : ''}`} style={{ padding: 14 }}>
      <div className="mk-row"><span className="mk-tile" style={{ width: 40, height: 40, borderRadius: 14 }}>{icon}</span><div className="grow"><p className="mk-meta" style={{ margin: 0 }}>{label}</p><p className="mk-price" style={{ fontSize: 24, color: red ? '#fff' : undefined }}>{value}</p></div></div>
    </div>
  );
}

function Today({ overview }: { overview: MarketplaceOverview | null }) {
  const [date, setDate] = useState(todayIst());
  const [board, setBoard] = useState<Awaited<ReturnType<typeof api.adminSessionsBoard>>['sessions'] | null>(null);
  const [needs, setNeeds] = useState<Awaited<ReturnType<typeof api.adminNeedsAction>>['sessions']>([]);
  useEffect(() => {
    setBoard(null);
    api.adminSessionsBoard(date).then((r) => setBoard(r.sessions)).catch(() => setBoard([]));
    api.adminNeedsAction().then((r) => setNeeds(r.sessions)).catch(() => setNeeds([]));
  }, [date]);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!overview && <div className="mk-skel" style={{ minHeight: 90 }} />}
      {overview && (
        <div className="mk-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          <Tile icon={<CalendarClock size={18} aria-hidden="true" />} label="Sessions today" value={overview.todaySessions} red />
          <Tile icon={<AlertTriangle size={18} aria-hidden="true" />} label="Need a new time" value={overview.needsAction} />
          <Tile icon={<FlaskConical size={18} aria-hidden="true" />} label="Lab collections today" value={overview.labToday} />
          <Tile icon={<FlaskConical size={18} aria-hidden="true" />} label="Late lab reports" value={overview.labLate} />
          <Tile icon={<HandCoins size={18} aria-hidden="true" />} label="Refunds to pay" value={overview.refundsPending} />
          <Tile icon={<ShieldCheck size={18} aria-hidden="true" />} label="Reported visits" value={overview.reports} />
          <Tile icon={<Store size={18} aria-hidden="true" />} label="Shops to review" value={overview.shopsPending} />
          <Tile icon={<Tag size={18} aria-hidden="true" />} label="Offers / ads / settings" value={`${overview.offersPending} / ${overview.adsPending} / ${overview.settingsPending}`} />
        </div>
      )}
      {needs.length > 0 && (
        <section className="mk-card" aria-labelledby="needs-title">
          <h3 id="needs-title" className="mk-title">Call these customers: their professional released the session</h3>
          <table className="mk-table"><thead><tr><th>When</th><th>Customer</th><th>Shop</th><th>Why</th></tr></thead>
            <tbody>{needs.map((n) => <tr key={n.bookingId}><td>{fmtDay(n.date)} {fmtTime(n.time)}</td><td>{n.customer}</td><td>{n.shop}</td><td>{n.reason}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      <section className="mk-card" aria-labelledby="board-title">
        <div className="mk-row" style={{ marginBottom: 8 }}>
          <h3 id="board-title" className="mk-title grow">Live board</h3>
          <label htmlFor="board-date" className="mk-meta">Day</label>
          <input id="board-date" type="date" className="mk-input" style={{ width: 170, minHeight: 38 }} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {!board && <div className="mk-skel" />}
        {board && board.length === 0 && <p className="mk-meta">No marketplace sessions this day.</p>}
        {board && board.length > 0 && (
          <table className="mk-table"><thead><tr><th>Time</th><th>Service</th><th>Customer</th><th>Professional</th><th>Where</th><th>Status</th></tr></thead>
            <tbody>{board.map((s) => <tr key={s.bookingId} style={{ background: s.flagged ? 'var(--accent-soft)' : undefined }}><td>{fmtTime(s.time)}</td><td>{s.service}</td><td>{s.customer}</td><td>{s.professional || '–'}</td><td>{s.mode === 'HOME' ? `Home${s.city ? `, ${s.city}` : ''}` : 'Clinic'}</td><td>{s.status.replace(/_/g, ' ').toLowerCase()}{s.flagged ? ' · flagged' : ''}</td></tr>)}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Shops({ sensitive }: { sensitive: Sensitive }) {
  const [status, setStatus] = useState('PENDING');
  const [kind, setKind] = useState<ShopKind | ''>('');
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.adminMarketStores>>['stores'] | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => api.adminMarketStores({ status, kind: kind || undefined }).then((r) => setRows(r.stores)).catch(() => setRows([])), [status, kind]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const decide = async (id: string, next: 'APPROVED' | 'SUSPENDED' | 'REJECTED') => {
    const reason = next === 'APPROVED' ? '' : await promptDialog({ title: next === 'SUSPENDED' ? 'Why suspend this shop?' : 'Why reject this shop?', label: 'Reason (the shop sees it)', minLength: 5, maxLength: 300 });
    if (next !== 'APPROVED' && !reason) return;
    sensitive(async () => { const r = await api.adminSetShopStatus(id, next, reason || undefined); setNotice(r.released ? `${r.released} booked sessions were released to their customers.` : 'Done.'); await load(); });
  };
  const strike = async (id: string) => {
    const reason = await promptDialog({ title: 'Add a reliability strike', label: 'What happened', minLength: 3, maxLength: 200 });
    if (reason) sensitive(async () => { const r = await api.adminShopStrike(id, reason); setNotice(`Strike added (${r.strikes} in 30 days).`); });
  };
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="mk-row" style={{ flexWrap: 'wrap' }}>
        <div className="mk-chips" style={{ padding: 0 }}>{['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'].map((s) => <button key={s} type="button" className="mk-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{s.toLowerCase()}</button>)}</div>
        <select aria-label="Kind" className="mk-select" style={{ width: 180, minHeight: 38 }} value={kind} onChange={(e) => setKind(e.target.value as ShopKind)}>
          <option value="">All kinds</option>{(['PHYSIO', 'HOMECARE', 'NURSING', 'LAB'] as ShopKind[]).map((k) => <option key={k} value={k}>{KINDS[k].label}</option>)}
        </select>
      </div>
      {notice && <p className="mk-note green" role="status">{notice}</p>}
      {!rows && <div className="mk-skel" />}
      {rows && rows.length === 0 && <p className="mk-meta">Nothing here.</p>}
      {(rows || []).map((s) => (
        <article key={s._id} className="mk-card" style={{ display: 'grid', gap: 8 }}>
          <div className="mk-row" style={{ flexWrap: 'wrap' }}>
            <div className="grow">
              <p className="mk-title">{s.name} <span className="mk-badge">{KINDS[s.kind].label}</span> <span className="mk-badge">{s.format.toLowerCase()}</span></p>
              <p className="mk-meta" style={{ margin: 0 }}>Owner {s.owner?.name || '–'} · {s.address?.city || 'no city'} · registration {s.registration?.number || 'none'}{s.registration?.body ? ` (${s.registration.body})` : ''}</p>
              <p className="mk-meta" style={{ margin: 0 }}>{s.clinic.enabled ? 'Clinic' : ''}{s.clinic.enabled && s.home.enabled ? ' + ' : ''}{s.home.enabled ? `home ${s.home.radiusKm} km at ${inr(s.home.ratePerKm)}/km` : ''} · rating {s.rating.avg.toFixed(1)} ({s.rating.count}) · reliability {Number.isFinite(s.reliability?.score) ? s.reliability!.score : 'new'} · {(s.strikes || []).length} strikes</p>
            </div>
            <div className="mk-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {s.status !== 'APPROVED' && <button type="button" className="mk-btn small" onClick={() => decide(s._id, 'APPROVED')}>Approve</button>}
              {s.status === 'APPROVED' && <button type="button" className="mk-btn ghost small" onClick={() => decide(s._id, 'SUSPENDED')}>Suspend</button>}
              {s.status === 'PENDING' && <button type="button" className="mk-btn ghost small" onClick={() => decide(s._id, 'REJECTED')}>Reject</button>}
              <button type="button" className="mk-btn soft small" onClick={() => strike(s._id)}>Strike</button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function Catalog({ sensitive }: { sensitive: Sensitive }) {
  const [kind, setKind] = useState<ShopKind>('PHYSIO');
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.adminCatalog>>['services'] | null>(null);
  const [draft, setDraft] = useState<{ id?: string; displayName: string; priceFloor: string; priceCeiling: string; minutes: string; fasting: string; homeAllowed: boolean; isActive: boolean } | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.adminCatalog(kind).then((r) => setRows(r.services)).catch(() => setRows([])), [kind]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setErr('');
    const body = { kind, displayName: draft.displayName, priceFloor: Number(draft.priceFloor), priceCeiling: Number(draft.priceCeiling), defaultDurationMinutes: Number(draft.minutes), homeAllowed: draft.homeAllowed, isActive: draft.isActive, ...(kind === 'LAB' ? { fastingHours: Number(draft.fasting) || 0 } : {}) };
    sensitive(async () => {
      try { if (draft.id) await api.adminUpdateCatalogService(draft.id, body); else await api.adminCreateCatalogService(body); setDraft(null); await load(); } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Failed'); throw e2; }
    });
  };
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="mk-row" style={{ flexWrap: 'wrap' }}>
        <div className="mk-chips grow" style={{ padding: 0 }}>{(['PHYSIO', 'HOMECARE', 'NURSING', 'LAB'] as ShopKind[]).map((k) => <button key={k} type="button" className="mk-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KINDS[k].label}</button>)}</div>
        <button type="button" className="mk-btn small" onClick={() => setDraft({ displayName: '', priceFloor: '', priceCeiling: '', minutes: kind === 'HOMECARE' ? '720' : kind === 'LAB' ? '15' : '45', fasting: '0', homeAllowed: true, isActive: true })}>Add Service</button>
      </div>
      {draft && (
        <form className="mk-card" onSubmit={save} style={{ display: 'grid', gap: 10 }}>
          <div className="mk-split">
            <div className="mk-field"><label htmlFor="c-name">Name</label><input id="c-name" className="mk-input" required value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} /></div>
            <div className="mk-field"><label htmlFor="c-min">{kind === 'HOMECARE' ? 'Shift length (min)' : 'Default length (min)'}</label><input id="c-min" type="number" min={10} max={1440} className="mk-input" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: e.target.value })} /></div>
            <div className="mk-field"><label htmlFor="c-floor">Price floor (₹)</label><input id="c-floor" type="number" min={1} required className="mk-input" value={draft.priceFloor} onChange={(e) => setDraft({ ...draft, priceFloor: e.target.value })} /></div>
            <div className="mk-field"><label htmlFor="c-ceil">Price ceiling (₹)</label><input id="c-ceil" type="number" min={1} required className="mk-input" value={draft.priceCeiling} onChange={(e) => setDraft({ ...draft, priceCeiling: e.target.value })} /></div>
            {kind === 'LAB' && <div className="mk-field"><label htmlFor="c-fast">Fasting hours (0 = none)</label><input id="c-fast" type="number" min={0} max={24} className="mk-input" value={draft.fasting} onChange={(e) => setDraft({ ...draft, fasting: e.target.value })} /></div>}
          </div>
          <label className="mk-row" style={{ gap: 8 }}><input type="checkbox" checked={draft.homeAllowed} onChange={(e) => setDraft({ ...draft, homeAllowed: e.target.checked })} /> {kind === 'LAB' ? 'Can be collected at home' : 'Can be done at home'}</label>
          <label className="mk-row" style={{ gap: 8 }}><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
          {err && <p className="mk-note" role="alert">{err}</p>}
          <div className="mk-row"><button type="submit" className="mk-btn small">Save</button><button type="button" className="mk-btn ghost small" onClick={() => setDraft(null)}>Cancel</button></div>
        </form>
      )}
      {!rows && <div className="mk-skel" />}
      {rows && (
        <table className="mk-table"><thead><tr><th>Service</th><th className="num">Floor</th><th className="num">Ceiling</th><th className="num">Length</th><th className="num">Shops</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s._id}>
              <td>{s.displayName}{s.category === 'LAB_PACKAGE' ? ' (package)' : ''}</td>
              <td className="num">{inr(s.marketplace.priceFloor)}</td><td className="num">{inr(s.marketplace.priceCeiling)}</td>
              <td className="num">{s.marketplace.defaultDurationMinutes || '–'}</td><td className="num">{s.shops}</td>
              <td>{s.availability.isActive ? 'Active' : 'Hidden'}</td>
              <td><button type="button" className="mk-btn soft small" onClick={() => setDraft({ id: s._id, displayName: s.displayName, priceFloor: String(s.marketplace.priceFloor), priceCeiling: String(s.marketplace.priceCeiling), minutes: String(s.marketplace.defaultDurationMinutes || 45), fasting: String(s.lab?.fastingHours || 0), homeAllowed: s.marketplace.homeAllowed !== false, isActive: s.availability.isActive })}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

function Refunds({ sensitive }: { sensitive: Sensitive }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.adminRefunds>>['refunds'] | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => api.adminRefunds().then((r) => setRows(r.refunds)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const pay = async (r: NonNullable<typeof rows>[number], online: boolean) => {
    const reference = online ? undefined : await promptDialog({ title: `Refund ${inr(r.amount)} by bank transfer`, label: 'Transfer reference (UTR)', minLength: 4, maxLength: 80 });
    if (!online && !reference) return;
    if (online && !(await confirmDialog({ title: `Refund ${inr(r.amount)} through Razorpay?`, confirmLabel: 'Refund' }))) return;
    sensitive(async () => { const out = await api.adminProcessRefund({ type: r.type, id: r.id, reference: reference || undefined }); setNotice(`Refunded ${inr(out.amount)} (${out.refundId}).`); await load(); });
  };
  if (!rows) return <div className="mk-skel" />;
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {notice && <p className="mk-note green" role="status">{notice}</p>}
      {rows.length === 0 && <p className="mk-meta">No refunds waiting.</p>}
      {rows.map((r) => (
        <article key={`${r.type}-${r.id}`} className="mk-card" style={{ padding: 14 }}>
          <div className="mk-row" style={{ flexWrap: 'wrap' }}>
            <span className="mk-tile"><BadgeIndianRupee size={20} aria-hidden="true" /></span>
            <div className="grow"><p className="mk-title">{inr(r.amount)} to {r.customer} <span className="mk-badge">{r.type === 'LAB' ? 'Lab order' : 'Care plan'}</span></p><p className="mk-meta" style={{ margin: 0 }}>{r.shop} · {r.reason} · since {fmtDay(r.since)}</p></div>
            {r.paymentId?.startsWith('pay_') && <button type="button" className="mk-btn small" onClick={() => pay(r, true)}>Refund Online</button>}
            <button type="button" className="mk-btn ghost small" onClick={() => pay(r, false)}>Mark Bank Transfer</button>
          </div>
        </article>
      ))}
    </section>
  );
}

function Reports({ sensitive }: { sensitive: Sensitive }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.adminReports>>['reports'] | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => api.adminReports().then((r) => setRows(r.reports)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const resolve = async (id: string, outcome: 'NO_SHOW' | 'EXTRA_CASH' | 'DISMISS') => {
    const note = await promptDialog({ title: outcome === 'DISMISS' ? 'Dismiss: what did you find?' : 'Confirm: what did you find?', label: 'Note', maxLength: 200, minLength: 3 });
    if (note === null) return;
    sensitive(async () => { const r = await api.adminResolveReport(id, outcome, note || undefined); setNotice(outcome === 'DISMISS' ? 'Dismissed.' : `Resolved.${r.credit ? ` ${inr(r.credit)} credit given.` : ''}${r.strike ? ' Strike added.' : ''}`); await load(); });
  };
  if (!rows) return <div className="mk-skel" />;
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {notice && <p className="mk-note green" role="status">{notice}</p>}
      {rows.length === 0 && <p className="mk-meta">Nothing reported.</p>}
      {rows.map((r) => (
        <article key={r.bookingId} className="mk-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
          <div className="mk-row" style={{ flexWrap: 'wrap' }}>
            <span className="mk-tile"><Users size={20} aria-hidden="true" /></span>
            <div className="grow"><p className="mk-title">{r.reason}</p><p className="mk-meta" style={{ margin: 0 }}>{fmtDay(r.date)} {fmtTime(r.time)} · customer {r.customer} · professional {r.professional || '–'}{r.shop ? ` · ${r.shop}` : ''} · {r.status.toLowerCase()}</p></div>
          </div>
          <div className="mk-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="mk-btn small" onClick={() => resolve(r.bookingId, 'NO_SHOW')}>Confirm No-Show</button>
            <button type="button" className="mk-btn soft small" onClick={() => resolve(r.bookingId, 'EXTRA_CASH')}>Confirm Extra Cash</button>
            <button type="button" className="mk-btn ghost small" onClick={() => resolve(r.bookingId, 'DISMISS')}>Dismiss</button>
          </div>
        </article>
      ))}
    </section>
  );
}

function Labs() {
  const [late, setLate] = useState(false);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.adminLabBoard>>['orders'] | null>(null);
  useEffect(() => { setRows(null); api.adminLabBoard({ late }).then((r) => setRows(r.orders)).catch(() => setRows([])); }, [late]);
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div className="mk-chips" style={{ padding: 0 }}><button type="button" className="mk-chip" aria-pressed={!late} onClick={() => setLate(false)}>All recent</button><button type="button" className="mk-chip" aria-pressed={late} onClick={() => setLate(true)}>Late reports</button></div>
      {!rows && <div className="mk-skel" />}
      {rows && rows.length === 0 && <p className="mk-meta">Nothing here.</p>}
      {rows && rows.length > 0 && (
        <table className="mk-table"><thead><tr><th>Slot</th><th>Lab</th><th>Customer</th><th>Tests</th><th>Status</th><th>Report due</th><th className="num">Total</th></tr></thead>
          <tbody>{rows.map((o) => <tr key={o.id} style={{ background: o.late ? 'var(--accent-soft)' : undefined }}><td>{fmtDay(o.slot.date)} {fmtTime(o.slot.time)}</td><td>{o.lab}</td><td>{o.customer}</td><td>{o.tests.join(', ')}</td><td>{o.status.replace(/_/g, ' ').toLowerCase()}</td><td>{o.reportDueAt ? new Date(o.reportDueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '–'}</td><td className="num">{inr(o.total)}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

function Offers({ sensitive }: { sensitive: Sensitive }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.adminOffers>>['offers'] | null>(null);
  const load = useCallback(() => api.adminOffers('PENDING').then((r) => setRows(r.offers)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    const reason = decision === 'REJECTED' ? await promptDialog({ title: 'Why reject this offer?', label: 'Reason (the shop sees it)', minLength: 3, maxLength: 200 }) : undefined;
    if (decision === 'REJECTED' && !reason) return;
    sensitive(async () => { await api.adminReviewOffer(id, decision, reason || undefined); await load(); });
  };
  if (!rows) return <div className="mk-skel" />;
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {rows.length === 0 && <p className="mk-meta">No offers waiting.</p>}
      {rows.map((o) => (
        <article key={o._id} className="mk-card" style={{ padding: 14 }}>
          <div className="mk-row" style={{ flexWrap: 'wrap' }}>
            <span className="mk-tile"><Tag size={20} aria-hidden="true" /></span>
            <div className="grow"><p className="mk-title">{o.offer.percent}% off the first session, up to {inr(o.offer.maxDiscount)}</p><p className="mk-meta" style={{ margin: 0 }}>{o.store?.name} · {o.service?.displayName || o.service?.name} · price {inr(o.clinic?.price ?? o.home?.price)}</p></div>
            <button type="button" className="mk-btn small" onClick={() => decide(o._id, 'APPROVED')}>Approve</button>
            <button type="button" className="mk-btn ghost small" onClick={() => decide(o._id, 'REJECTED')}>Reject</button>
          </div>
        </article>
      ))}
    </section>
  );
}
