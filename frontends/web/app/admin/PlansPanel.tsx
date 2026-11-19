'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminMembershipPlan } from '@medrush/shared';
import { api } from '@/lib/api';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
type Draft = { code: string; name: string; price: string; days: string; note: string; sortOrder: string; active: boolean };

const EMPTY: Draft = { code: '', name: 'Nabz Plus', price: '', days: '30', note: '', sortOrder: '0', active: true };
const toDraft = (p: AdminMembershipPlan): Draft => ({ code: p.code, name: p.name, price: String(p.price), days: String(p.days), note: p.note || '', sortOrder: String(p.sortOrder || 0), active: p.active });
const perMonth = (price: number, days: number) => Math.round((price / days) * 30);

/**
 * Nabz Plus plans: what customers can buy, at what price and for how long.
 * Changes apply to new purchases; customers who already paid keep their period.
 * The free-trial length and the member benefits live in Ads & settings.
 */
export default function PlansPanel({ sensitive }: { sensitive: Sensitive }) {
  const [plans, setPlans] = useState<AdminMembershipPlan[] | null>(null);
  const [trialDays, setTrialDays] = useState(0);
  const [onlinePayment, setOnlinePayment] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.adminMembershipPlans()
      .then((r) => { setPlans(r.plans); setTrialDays(r.trialDays); setOnlinePayment(r.onlinePayment); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setNotice(null);
    setError(null);
    const d = editing;
    return sensitive(async () => {
      const r = await api.adminSaveMembershipPlan(d.code.trim().toUpperCase(), {
        name: d.name.trim(), price: Number(d.price), days: Number(d.days), note: d.note.trim(), sortOrder: Number(d.sortOrder) || 0, active: d.active
      });
      setNotice(`${r.plan.name} (${r.plan.code}) saved. New purchases use it from now on.`);
      setEditing(null);
      load();
    });
  }

  const toggle = (p: AdminMembershipPlan) => sensitive(async () => {
    await api.adminSaveMembershipPlan(p.code, { active: !p.active });
    setNotice(`${p.name}: ${p.active ? 'no longer on sale. Current members keep it until it ends.' : 'on sale again.'}`);
    load();
  });

  const onSale = plans?.filter((p) => p.active).length ?? 0;

  return (
    <section className="admin-section">
      <header className="admin-section-head row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>Nabz Plus plans</h2>
          <p className="muted">What customers can buy. Price and length changes apply to new purchases only; anyone who already paid keeps their period.</p>
        </div>
        {!editing && <button className="btn" onClick={() => { setIsNew(true); setEditing(EMPTY); }}>Add a plan</button>}
      </header>

      {notice && <div className="notice good" role="status">{notice}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}
      {!onlinePayment && <div className="notice">Online payment is off on this server, so customers can see plans but can&apos;t buy them yet.</div>}
      {plans && onSale === 0 && <div className="notice bad">No plan is on sale. Customers can&apos;t join Nabz Plus until you switch one on.</div>}

      {editing && (
        <form className="card admin-card" onSubmit={save}>
          <h3 style={{ marginTop: 0 }}>{isNew ? 'New plan' : `Edit ${editing.code}`}</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <div>
              <label htmlFor="pl-code">Plan code</label>
              <input id="pl-code" className="input mono" value={editing.code} disabled={!isNew} required pattern="[A-Za-z][A-Za-z0-9_]{2,29}"
                placeholder="PLUS_QUARTERLY" onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} />
              {isNew && <small className="muted">Can&apos;t be changed later.</small>}
            </div>
            <div>
              <label htmlFor="pl-name">Name customers see</label>
              <input id="pl-name" className="input" value={editing.name} required minLength={2} maxLength={40} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pl-price">Price (₹)</label>
              <input id="pl-price" className="input" type="number" min={1} max={100000} step={1} value={editing.price} required onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pl-days">Length (days)</label>
              <input id="pl-days" className="input" type="number" min={1} max={366} step={1} value={editing.days} required onChange={(e) => setEditing({ ...editing, days: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pl-note">Tag (optional)</label>
              <input id="pl-note" className="input" value={editing.note} maxLength={60} placeholder="Best value" onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pl-order">Show order</label>
              <input id="pl-order" className="input" type="number" min={0} max={999} step={1} value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} />
            </div>
          </div>
          <label className="check-row" htmlFor="pl-active" style={{ marginTop: 8 }}>
            <input id="pl-active" type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
            <span><strong>On sale</strong><small>Customers can buy this plan.</small></span>
          </label>
          {Number(editing.price) > 0 && Number(editing.days) > 0 && (
            <p className="muted" style={{ margin: '6px 0 0' }}>About ₹{perMonth(Number(editing.price), Number(editing.days))} a month.</p>
          )}
          <div className="review-actions">
            <button className="btn" type="submit">Save plan</button>
            <button className="btn secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {!plans && !error && <p className="muted">Loading plans…</p>}
      <div className="team-grid">
        {plans?.map((p) => (
          <article key={p.code} className="card admin-card team-card">
            <div className="row">
              <div>
                <h3 style={{ margin: 0 }}>{p.name} {p.note && <span className="pill">{p.note}</span>}</h3>
                <span className="muted mono">{p.code}</span>
              </div>
              <span className={`pill ${p.active ? 'mint' : 'rx'}`}>{p.active ? 'On sale' : 'Off sale'}</span>
            </div>
            <dl className="kv compact">
              <dt>Price</dt><dd>₹{p.price} for {p.days} days</dd>
              <dt>Per month</dt><dd>about ₹{perMonth(p.price, p.days)}</dd>
              <dt>Paying members now</dt><dd>{p.members}</dd>
              {p.trials > 0 && <><dt>On free trial</dt><dd>{p.trials}</dd></>}
            </dl>
            <div className="review-actions">
              <button className="btn" onClick={() => { setIsNew(false); setEditing(toDraft(p)); }}>Edit</button>
              <button className={`btn secondary ${p.active ? 'danger' : ''}`} onClick={() => toggle(p)}>{p.active ? 'Take off sale' : 'Put on sale'}</button>
            </div>
          </article>
        ))}
      </div>

      <p className="muted" style={{ margin: 0 }}>
        Free trial: {trialDays > 0 ? `${trialDays} days, once per customer` : 'off'}. Change the trial length and the member benefits (free delivery, no visit fee) in <strong>Ads &amp; settings</strong>.
      </p>
    </section>
  );
}
