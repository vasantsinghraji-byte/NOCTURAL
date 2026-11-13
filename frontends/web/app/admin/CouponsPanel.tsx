'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminCoupon, CouponInput, CouponService } from '@medrush/shared';
import { api } from '@/lib/api';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
type Draft = {
  code: string; description: string; kind: 'PERCENT' | 'FLAT'; value: string; maxDiscount: string; minOrder: string;
  services: CouponService[]; startsAt: string; endsAt: string; totalLimit: string; perCustomerLimit: string; firstOrderOnly: boolean; requireVerifiedPhone: boolean; active: boolean;
};

const toLocal = (d: Date | string) => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const emptyDraft = (): Draft => ({
  code: '', description: '', kind: 'PERCENT', value: '10', maxDiscount: '100', minOrder: '0', services: ['PHARMACY'],
  startsAt: toLocal(new Date()), endsAt: toLocal(new Date(Date.now() + 30 * 86400000)), totalLimit: '', perCustomerLimit: '1', firstOrderOnly: false, requireVerifiedPhone: true, active: true
});
const toDraft = (c: AdminCoupon): Draft => ({
  code: c.code, description: c.description, kind: c.kind, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : '', minOrder: String(c.minOrder || 0),
  services: c.services, startsAt: toLocal(c.startsAt), endsAt: toLocal(c.endsAt), totalLimit: c.totalLimit ? String(c.totalLimit) : '', perCustomerLimit: String(c.perCustomerLimit || 1),
  firstOrderOnly: !!c.firstOrderOnly, requireVerifiedPhone: !!c.requireVerifiedPhone || !!c.firstOrderOnly, active: c.active !== false
});
const STATUS: Record<AdminCoupon['status'], { label: string; cls: string }> = {
  LIVE: { label: 'Live', cls: 'mint' }, SCHEDULED: { label: 'Starts later', cls: '' }, ENDED: { label: 'Ended', cls: '' }, USED_UP: { label: 'Used up', cls: 'rx' }, OFF: { label: 'Off', cls: 'rx' }
};

/**
 * Discount codes. Nabz pays for every discount: it comes off the customer's
 * bill, never off what a store or professional earns. Codes are checked again
 * when an order is placed, so a code switched off here stops working at once.
 */
export default function CouponsPanel({ sensitive }: { sensitive: Sensitive }) {
  const [rows, setRows] = useState<AdminCoupon[] | null>(null);
  const [services, setServices] = useState<Array<{ key: CouponService; label: string }>>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.adminCoupons().then((r) => { setRows(r.coupons); setServices(r.services); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const labelOf = (k: CouponService) => services.find((s) => s.key === k)?.label || k;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setNotice(null);
    setError(null);
    const d = draft;
    const input: CouponInput = {
      description: d.description.trim(), kind: d.kind, value: Number(d.value),
      maxDiscount: d.kind === 'PERCENT' && d.maxDiscount ? Number(d.maxDiscount) : null,
      minOrder: Number(d.minOrder) || 0, services: d.services,
      startsAt: new Date(d.startsAt).toISOString(), endsAt: new Date(d.endsAt).toISOString(),
      totalLimit: d.totalLimit ? Number(d.totalLimit) : null, perCustomerLimit: Number(d.perCustomerLimit) || 1,
      firstOrderOnly: d.firstOrderOnly, requireVerifiedPhone: d.requireVerifiedPhone || d.firstOrderOnly, active: d.active
    };
    return sensitive(async () => {
      if (editingId) {
        const r = await api.adminUpdateCoupon(editingId, input);
        setNotice(`${r.coupon.code} saved.`);
      } else {
        const r = await api.adminCreateCoupon({ ...input, code: d.code.trim().toUpperCase() });
        setNotice(`${r.coupon.code} created. Customers can use it from ${day(r.coupon.startsAt)}.`);
      }
      setDraft(null);
      setEditingId(null);
      load();
    });
  }

  const toggle = (c: AdminCoupon) => sensitive(async () => {
    await api.adminUpdateCoupon(c._id, { active: !c.active });
    setNotice(`${c.code}: ${c.active ? 'switched off. It stops working straight away.' : 'switched on.'}`);
    load();
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => draft && setDraft({ ...draft, [k]: v });
  const toggleService = (k: CouponService) => draft && set('services', draft.services.includes(k) ? draft.services.filter((s) => s !== k) : [...draft.services, k]);

  return (
    <section className="admin-section" style={{ marginTop: 18 }}>
      <header className="admin-section-head row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>Coupon codes</h2>
          <p className="muted">Nabz pays for every discount: it comes off the customer&apos;s bill, never off what a store or professional earns.</p>
        </div>
        {!draft && <button className="btn" onClick={() => { setEditingId(null); setDraft(emptyDraft()); }}>New coupon</button>}
      </header>

      {notice && <div className="notice good" role="status">{notice}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}

      {draft && (
        <form className="card admin-card" onSubmit={save}>
          <h3 style={{ marginTop: 0 }}>{editingId ? `Edit ${draft.code}` : 'New coupon'}</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <label htmlFor="cp-code">Code</label>
              <input id="cp-code" className="input mono" value={draft.code} disabled={!!editingId} required pattern="[A-Za-z0-9]{3,20}" maxLength={20}
                placeholder="WELCOME20" onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} />
              {!editingId && <small className="muted">3-20 letters and digits. Can&apos;t be changed later.</small>}
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label htmlFor="cp-desc">What customers see</label>
              <input id="cp-desc" className="input" value={draft.description} required minLength={3} maxLength={120} placeholder="20% off your first medicine order" onChange={(e) => set('description', e.target.value)} />
            </div>
            <div>
              <label htmlFor="cp-kind">Discount</label>
              <select id="cp-kind" className="input" value={draft.kind} onChange={(e) => set('kind', e.target.value as Draft['kind'])}>
                <option value="PERCENT">Percent off</option>
                <option value="FLAT">Flat ₹ off</option>
              </select>
            </div>
            <div>
              <label htmlFor="cp-value">{draft.kind === 'PERCENT' ? 'Percent (%)' : 'Amount (₹)'}</label>
              <input id="cp-value" className="input" type="number" step={1} min={1} max={draft.kind === 'PERCENT' ? 100 : 100000} value={draft.value} required onChange={(e) => set('value', e.target.value)} />
            </div>
            {draft.kind === 'PERCENT' && (
              <div>
                <label htmlFor="cp-cap">Up to (₹, optional)</label>
                <input id="cp-cap" className="input" type="number" step={1} min={1} value={draft.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} />
              </div>
            )}
            <div>
              <label htmlFor="cp-min">Minimum order (₹)</label>
              <input id="cp-min" className="input" type="number" step={1} min={0} value={draft.minOrder} onChange={(e) => set('minOrder', e.target.value)} />
            </div>
            <div>
              <label htmlFor="cp-start">Starts</label>
              <input id="cp-start" className="input" type="datetime-local" value={draft.startsAt} required onChange={(e) => set('startsAt', e.target.value)} />
            </div>
            <div>
              <label htmlFor="cp-end">Ends</label>
              <input id="cp-end" className="input" type="datetime-local" value={draft.endsAt} required onChange={(e) => set('endsAt', e.target.value)} />
            </div>
            <div>
              <label htmlFor="cp-total">Total uses (empty = no limit)</label>
              <input id="cp-total" className="input" type="number" step={1} min={1} value={draft.totalLimit} onChange={(e) => set('totalLimit', e.target.value)} />
            </div>
            <div>
              <label htmlFor="cp-per">Uses per customer</label>
              <input id="cp-per" className="input" type="number" step={1} min={1} max={100} value={draft.perCustomerLimit} required onChange={(e) => set('perCustomerLimit', e.target.value)} />
            </div>
          </div>

          <fieldset className="access-group" style={{ marginTop: 12 }}>
            <legend>Works on</legend>
            <div className="kind-row">
              {services.map((s) => (
                <label key={s.key} className={`kind-chip ${draft.services.includes(s.key) ? 'on' : ''}`} htmlFor={`cp-svc-${s.key}`}>
                  <input id={`cp-svc-${s.key}`} type="checkbox" checked={draft.services.includes(s.key)} onChange={() => toggleService(s.key)} />
                  {s.label.charAt(0).toUpperCase() + s.label.slice(1)}
                </label>
              ))}
            </div>
            {!draft.services.length && <p className="muted" style={{ margin: '6px 0 0' }}>Pick at least one.</p>}
          </fieldset>
          <label className="check-row" htmlFor="cp-first" style={{ marginTop: 8 }}>
            <input id="cp-first" type="checkbox" checked={draft.firstOrderOnly} onChange={(e) => setDraft({ ...draft, firstOrderOnly: e.target.checked, requireVerifiedPhone: e.target.checked || draft.requireVerifiedPhone })} />
            <span><strong>First order only</strong><small>Only for a customer&apos;s first order of that service on Nabz.</small></span>
          </label>
          <label className="check-row" htmlFor="cp-phone">
            <input id="cp-phone" type="checkbox" checked={draft.requireVerifiedPhone || draft.firstOrderOnly} disabled={draft.firstOrderOnly} onChange={(e) => set('requireVerifiedPhone', e.target.checked)} />
            <span><strong>Verified mobile only</strong><small>Only customers who signed in with their mobile number and OTP. Stops one person using many email accounts. Always on for first-order codes.</small></span>
          </label>
          <label className="check-row" htmlFor="cp-active">
            <input id="cp-active" type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
            <span><strong>On</strong><small>Switch off to stop the code straight away.</small></span>
          </label>
          <div className="review-actions">
            <button className="btn" type="submit" disabled={!draft.services.length}>{editingId ? 'Save coupon' : 'Create coupon'}</button>
            <button className="btn secondary" type="button" onClick={() => { setDraft(null); setEditingId(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {!rows && !error && <p className="muted">Loading coupons…</p>}
      {rows && rows.length === 0 && !draft && <p className="muted">No coupons yet.</p>}
      <div className="team-grid">
        {rows?.map((c) => (
          <article key={c._id} className="card admin-card team-card">
            <div className="row">
              <div>
                <h3 style={{ margin: 0 }} className="mono">{c.code}</h3>
                <span className="muted">{c.description}</span>
              </div>
              <span className={`pill ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
            </div>
            <dl className="kv compact">
              <dt>Discount</dt><dd>{c.offer}{c.minOrder ? ` on orders from ₹${c.minOrder}` : ''}</dd>
              <dt>Works on</dt><dd>{c.services.map(labelOf).join(', ')}</dd>
              <dt>Runs</dt><dd>{day(c.startsAt)} – {day(c.endsAt)}</dd>
              <dt>Used</dt><dd>{c.uses}{c.totalLimit ? ` of ${c.totalLimit}` : ''} · {c.perCustomerLimit} per customer{c.firstOrderOnly ? ' · first order only' : ''}{c.requireVerifiedPhone || c.firstOrderOnly ? ' · verified mobile only' : ''}</dd>
              <dt>Discount given</dt><dd>₹{c.discountGiven}</dd>
            </dl>
            <div className="review-actions">
              <button className="btn" onClick={() => { setEditingId(c._id); setDraft(toDraft(c)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
              <button className={`btn secondary ${c.active ? 'danger' : ''}`} onClick={() => toggle(c)}>{c.active ? 'Switch off' : 'Switch on'}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
