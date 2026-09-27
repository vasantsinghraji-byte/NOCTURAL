'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import type { Campaign, CampaignAudience } from '@medrush/shared';
import { api } from '@/lib/api';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
const AUDIENCES: Array<{ key: CampaignAudience; label: string }> = [
  { key: 'CUSTOMERS', label: 'All customers' },
  { key: 'PARTNERS', label: 'All partners' },
  { key: 'MEDICAL_STAFF', label: 'Nurses & physios' },
  { key: 'PHARMACIES', label: 'Pharmacies' }
];
// Where the button can take people (in-app pages only).
const LINKS: Record<'customer' | 'partner', Array<{ path: string; label: string }>> = {
  customer: [
    { path: '/pharmacy', label: 'Pharmacy' },
    { path: '/nursing', label: 'Book a nurse / physio' },
    { path: '/plus', label: 'Nabz Plus' },
    { path: '/orders', label: 'My orders' }
  ],
  partner: [
    { path: '/staff', label: 'Staff dashboard' },
    { path: '/vendor', label: 'Pharmacy dashboard' },
    { path: '/partner/account', label: 'Partner account' }
  ]
};
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Offers and announcements. Live campaigns show in the "Offers & updates" feed
 * in the apps and on the website; with push on, they're also sent as a push
 * notification once at the start time.
 */
export default function CampaignsPanel({ sensitive }: { sensitive: Sensitive }) {
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.adminCampaigns().then((r) => setRows(r.campaigns)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  function cancel(c: Campaign) {
    if (!window.confirm(`Stop “${c.title}”? It disappears from the feed straight away.`)) return;
    sensitive(async () => { await api.adminCancelCampaign(c._id); setNotice('Campaign stopped.'); load(); });
  }

  return (
    <section className="campaign-layout" style={{ marginTop: 12 }}>
      <Composer sensitive={sensitive} onCreated={(c) => { setNotice(c.status === 'SCHEDULED' ? `Scheduled for ${when(c.sendAt)}.` : 'Campaign is live.'); load(); }} />
      <div className="stack">
        <h3 style={{ margin: 0 }}>Campaigns</h3>
        {error && <div className="notice bad" role="alert">{error}</div>}
        {notice && <div className="notice good" role="status">{notice}</div>}
        {rows && rows.length === 0 && <p className="muted">No campaigns yet.</p>}
        {rows?.map((c) => (
          <div key={c._id} className="card stack">
            <div className="row">
              <b>{c.title}</b>
              <span className={`pill ${c.status === 'LIVE' ? 'mint' : c.status === 'SCHEDULED' ? 'sky' : c.status === 'CANCELLED' ? 'rx' : ''}`}>{c.status.toLowerCase()}</span>
            </div>
            <span className="muted">{c.body}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {AUDIENCES.find((a) => a.key === c.audience)?.label} · {when(c.sendAt)} → {when(c.expiresAt)}
              {c.offerCode ? <> · code <span className="mono">{c.offerCode}</span></> : null}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {c.opens} opened · push {c.push.status === 'OFF' ? 'off' : c.push.status === 'DONE' ? `sent to ${c.push.sent} of ${c.push.targeted} devices` : c.push.status.toLowerCase()}
              {c.push.note ? ` · ${c.push.note}` : ''}
            </span>
            {(c.status === 'LIVE' || c.status === 'SCHEDULED') && (
              <button className="btn secondary" style={{ alignSelf: 'flex-start' }} onClick={() => cancel(c)}>Stop campaign</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Composer({ sensitive, onCreated }: { sensitive: Sensitive; onCreated: (c: Campaign) => void }) {
  const [f, setF] = useState({ title: '', body: '', audience: 'CUSTOMERS' as CampaignAudience, offerCode: '', ctaLabel: '', ctaPath: '', schedule: false, sendAt: toLocalInput(new Date(Date.now() + 3600000)), days: '7', push: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const links = f.audience === 'CUSTOMERS' ? LINKS.customer : LINKS.partner;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const start = f.schedule ? new Date(f.sendAt) : new Date();
    if (f.schedule && start.getTime() < Date.now()) { setError('Pick a time in the future.'); return; }
    const end = new Date(start.getTime() + Number(f.days) * 86400000);
    const input = {
      title: f.title.trim(),
      body: f.body.trim(),
      audience: f.audience,
      push: f.push,
      ...(f.schedule ? { sendAt: start.toISOString() } : {}),
      expiresAt: end.toISOString(),
      ...(f.offerCode.trim() ? { offerCode: f.offerCode.trim() } : {}),
      ...(f.ctaPath ? { cta: { label: f.ctaLabel.trim() || 'Open', path: f.ctaPath } } : {})
    };
    const who = AUDIENCES.find((a) => a.key === f.audience)?.label.toLowerCase();
    if (!window.confirm(`${f.schedule ? 'Schedule' : 'Send'} “${input.title}” to ${who}${f.push ? ' with a push notification' : ''}?`)) return;
    setBusy(true);
    sensitive(async () => {
      const r = await api.adminCreateCampaign(input);
      setF((x) => ({ ...x, title: '', body: '', offerCode: '', ctaLabel: '', ctaPath: '' }));
      onCreated(r.campaign);
    }).catch((err) => setError(err instanceof Error ? err.message : 'Could not create')).finally(() => setBusy(false));
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h3 className="inline-title"><Megaphone size={18} aria-hidden="true" /> New campaign</h3>
      <label htmlFor="c-aud">Who gets it</label>
      <select id="c-aud" className="input" value={f.audience} onChange={(e) => { set('audience', e.target.value as CampaignAudience); set('ctaPath', ''); }}>
        {AUDIENCES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </select>
      <label htmlFor="c-title">Title <span className="muted">({f.title.length}/80)</span></label>
      <input id="c-title" className="input" required minLength={3} maxLength={80} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Flat 15% off medicines this weekend" />
      <label htmlFor="c-body">Message <span className="muted">({f.body.length}/300)</span></label>
      <textarea id="c-body" className="input" required minLength={3} maxLength={300} rows={3} value={f.body} onChange={(e) => set('body', e.target.value)} placeholder="Order before Sunday midnight. Delivered in Jaipur within the hour." />
      <div className="form-2col">
        <div>
          <label htmlFor="c-code">Offer code (optional)</label>
          <input id="c-code" className="input mono" maxLength={20} value={f.offerCode} onChange={(e) => set('offerCode', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="WEEKEND15" />
        </div>
        <div>
          <label htmlFor="c-days">Runs for</label>
          <select id="c-days" className="input" value={f.days} onChange={(e) => set('days', e.target.value)}>
            {['1', '3', '7', '14', '30', '60'].map((d) => <option key={d} value={d}>{d} day{d === '1' ? '' : 's'}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="c-link">Button opens</label>
          <select id="c-link" className="input" value={f.ctaPath} onChange={(e) => set('ctaPath', e.target.value)}>
            <option value="">No button</option>
            {links.map((l) => <option key={l.path} value={l.path}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="c-cta">Button text</label>
          <input id="c-cta" className="input" maxLength={24} disabled={!f.ctaPath} value={f.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} placeholder="Shop now" />
        </div>
      </div>
      <label className="check-line"><input type="checkbox" checked={f.schedule} onChange={(e) => set('schedule', e.target.checked)} /> Schedule for later</label>
      {f.schedule && <input className="input" type="datetime-local" aria-label="Start time" value={f.sendAt} onChange={(e) => set('sendAt', e.target.value)} />}
      <label className="check-line"><input type="checkbox" checked={f.push} onChange={(e) => set('push', e.target.checked)} /> Also send a push notification (people who turned push off are skipped)</label>

      <div className="campaign-preview" aria-label="Preview">
        <span className="offer-kicker">Preview · Offers &amp; updates</span>
        <b>{f.title || 'Your title'}</b>
        <span>{f.body || 'Your message'}</span>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
          {f.offerCode && <span className="pill dark mono">{f.offerCode}</span>}
          {f.ctaPath && <span className="pill">{f.ctaLabel || 'Open'} →</span>}
        </div>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : f.schedule ? 'Schedule campaign' : 'Send now'}</button>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Needs a fresh authenticator code. Recorded in the audit log.</p>
    </form>
  );
}
